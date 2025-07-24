import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// --- Interfaces para la estructura de datos ---

// Interfaz para un detalle de resultado en la petición
interface ResultInput {
  type: number;
  ident_protocol: string;
  analytical_code: string;
  analytical_name: string;
  reference_value: string;
  unit: string;
  code: string;
  result: string;
}

// Interfaz para la cabecera administrativa en la petición (incluye sus resultados)
interface AdministrativeInput {
  invoicedetail_id?: string | null; // Puede ser nulo
  ident_protocol?: string | null;
  lab_identification?: string | null;
  surname?: string | null;
  firstname?: string | null;
  sex?: string | null;
  date_of_birth?: string | null;
  external_identifier?: string | null;
  street_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  prescribing_doctor?: string | null;
  date_request?: string | null;
  empty_field?: string | null;
  protocol_type?: string | null;
  cover?: string | null;
  holder?: string | null;
  cod_tit1?: string | null;
  cod_tit2?: string | null;
  file_name?: string | null;
  status?: number | null;
  results: ResultInput[]; // Array de los detalles de resultados
}

// --- Funciones del Controlador ---

// 1. Crear un nuevo Registro Administrativo con sus Resultados
export const createAdministrativeWithResults = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { results, ...administrativeData }: AdministrativeInput = req.body;

    // Validar datos de entrada básicos para la cabecera (puedes añadir más validaciones según tus necesidades)
    if (!results || results.length === 0) {
      return res.status(400).json({ error: 'Al menos un detalle de resultado es obligatorio.' });
    }

    // Validar que todos los detalles de resultados tengan los campos requeridos
    for (const result of results) {
      if (!result.type || !result.ident_protocol || !result.analytical_code || !result.analytical_name || !result.reference_value || !result.unit || !result.code || !result.result) {
        return res.status(400).json({ error: 'Todos los campos requeridos en los detalles de resultados son obligatorios.' });
      }
    }

    // Insertar la cabecera administrativa
    const { data: adminData, error: adminError } = await supabase
      .from('administrative')
      .insert({
        ...administrativeData,
        // created_at, updated_at, is_active se manejan por defecto en la tabla
      })
      .select('administrative_id'); // Solo necesitamos el administrative_id para los detalles

    if (adminError || !adminData || adminData.length === 0) {
      console.error('Error al crear el registro administrativo:', adminError);
      return res.status(500).json({ error: 'Error al crear el registro administrativo principal.' });
    }

    const administrative_id = adminData[0].administrative_id;

    // Preparar los resultados para la inserción
    const resultsToInsert = results.map(result => ({
      ...result,
      administrative_id: administrative_id, // Asignar el ID administrativo recién creado
      // created_at, updated_at, is_active se manejan por defecto en la tabla
    }));

    // Insertar los detalles de resultados
    const { data: resultData, error: resultError } = await supabase
      .from('result')
      .insert(resultsToInsert)
      .select(); // Seleccionar todos los campos de los detalles insertados

    if (resultError) {
      console.error('Error al crear los detalles de resultados:', resultError);
      // Si los detalles fallan, revertimos la creación del registro administrativo principal.
      await supabase.from('administrative').delete().eq('administrative_id', administrative_id);
      return res.status(500).json({ error: 'Error al crear los detalles de resultados. El registro administrativo principal fue revertido.' });
    }

    res.status(201).json({
      message: 'Registro administrativo y resultados creados exitosamente.',
      administrative: adminData[0],
      results: resultData,
    });

  } catch (err: any) {
    console.error('Excepción en createAdministrativeWithResults:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 2. Obtener todos los Registros Administrativos (solo cabeceras)
export const getAllAdministratives = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('administrative')
      .select('*')
      .eq('is_active', true) // Solo registros activos
      .order('created_at', { ascending: false }); // Ordenar por fecha de creación

    if (error) {
      console.error('Error al obtener registros administrativos:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Excepción en getAllAdministratives:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 3. Obtener Detalles de Resultados de un Registro Administrativo Específico por administrative_id
export const getAdministrativeResultsById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { administrativeId } = req.params; // administrativeId viene de la URL

    if (!administrativeId) {
      return res.status(400).json({ error: 'ID administrativo es obligatorio.' });
    }

    const { data, error } = await supabase
      .from('result')
      .select('*')
      .eq('administrative_id', administrativeId)
      .eq('is_active', true) // Solo detalles activos
      .order('created_at', { ascending: true }); // Ordenar por fecha de creación

    if (error) {
      console.error('Error al obtener detalles de resultados del registro administrativo:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No se encontraron resultados para el registro administrativo especificado.' });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Excepción en getAdministrativeResultsById:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 4. "Eliminar" un Registro Administrativo y sus Resultados Asociados (Soft Delete)
export const deleteAdministrative = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { administrativeId } = req.params;

    if (!administrativeId) {
      return res.status(400).json({ error: 'ID administrativo es obligatorio para la eliminación.' });
    }

    // Primero, actualizar is_active a false para los resultados asociados
    const { error: updateResultsError } = await supabase
      .from('result')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('administrative_id', administrativeId);

    if (updateResultsError) {
      console.error('Error al actualizar resultados a inactivos:', updateResultsError);
      return res.status(500).json({ error: 'Error al actualizar los resultados asociados.' });
    }

    // Luego, actualizar is_active a false para el registro administrativo principal
    const { error: updateAdminError } = await supabase
      .from('administrative')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('administrative_id', administrativeId);

    if (updateAdminError) {
      console.error('Error al actualizar el registro administrativo principal a inactivo:', updateAdminError);
      return res.status(500).json({ error: 'Error al actualizar el registro administrativo principal.' });
    }

    res.status(200).json({ message: 'Registro administrativo y sus resultados marcados como inactivos exitosamente.' });

  } catch (err: any) {
    console.error('Excepción en deleteAdministrative:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};