import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// --- Interfaces para la estructura de datos ---

// Interfaz para un detalle de factura en la petición
interface InvoiceDetailInput {
  demande: string;
  name_patient: string;
  date_prel: string;
  ref_patient: string;
  montant: number; // Numeric en DB, lo manejamos como number en TS
  unknow?: string | null; // Puede ser null
}

// Interfaz para la factura principal en la petición (incluye sus detalles)
interface InvoiceInput {
  date: string; // O Date si prefieres manejarlo como objeto Date en el frontend y convertirlo
  description: string;
  is_payed?: boolean; // Opcional, con valor por defecto en DB
  upload_file?: string | null; // Opcional, puede ser null
  details: InvoiceDetailInput[]; // Array de los detalles de la factura
}

interface UpdatePaymentStatusBody {
  is_payed: boolean;
}

// --- Funciones del Controlador ---

// 1. Crear una nueva Factura con sus Detalles
export const createInvoiceWithDetails = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { date, description, is_payed, upload_file, details }: InvoiceInput = req.body;

    // Validar datos de entrada básicos para la cabecera
    if (!date || !description || !details || details.length === 0) {
      return res.status(400).json({ error: 'La fecha, descripción y al menos un detalle de factura son obligatorios.' });
    }

    // Validar que todos los detalles tengan los campos requeridos
    for (const detail of details) {
      if (!detail.demande || !detail.name_patient || !detail.date_prel || !detail.ref_patient || detail.montant === undefined || detail.montant === null) {
        return res.status(400).json({ error: 'Todos los campos requeridos en los detalles de la factura (demande, name_patient, date_prel, ref_patient, montant) son obligatorios.' });
      }
    }

    // Insertar la cabecera de la factura
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoice')
      .insert({
        date,
        description,
        is_payed: is_payed ?? false, // Usar el valor proporcionado o el predeterminado de la base de datos
        upload_file: upload_file ?? null, // Usar el valor proporcionado o null
        // created_at, updated_at, is_active se manejan por defecto en la tabla
      })
      .select('invoice_id'); // Solo necesitamos el invoice_id para los detalles

    if (invoiceError || !invoiceData || invoiceData.length === 0) {
      console.error('Error al crear la factura:', invoiceError);
      return res.status(500).json({ error: 'Error al crear la factura principal.' });
    }

    const invoice_id = invoiceData[0].invoice_id;

    // Preparar los detalles para la inserción
    const detailsToInsert = details.map(detail => ({
      ...detail,
      invoice_id: invoice_id, // Asignar el ID de la factura recién creada
      // created_at, updated_at, is_active se manejan por defecto en la tabla
    }));

    // Insertar los detalles de la factura
    const { data: detailData, error: detailError } = await supabase
      .from('invoicedetail')
      .insert(detailsToInsert)
      .select(); // Seleccionar todos los campos de los detalles insertados

    if (detailError) {
      console.error('Error al crear los detalles de la factura:', detailError);
      // Si los detalles fallan, revertimos la creación de la factura principal.
      await supabase.from('invoice').delete().eq('invoice_id', invoice_id);
      return res.status(500).json({ error: 'Error al crear los detalles de la factura. La factura principal fue revertida.' });
    }

    res.status(201).json({
      message: 'Factura y detalles creados exitosamente.',
      invoice: invoiceData[0],
      details: detailData,
    });

  } catch (err: any) {
    console.error('Excepción en createInvoiceWithDetails:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 2. Obtener todas las Facturas (solo cabeceras)
export const getAllInvoices = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('invoice')
      .select('*')
      .eq('is_active', true) // Solo facturas activas
      .order('created_at', { ascending: false }); // Ordenar por fecha de creación

    if (error) {
      console.error('Error al obtener facturas:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Excepción en getAllInvoices:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 3. Obtener Detalles de una Factura Específica por invoice_id
export const getInvoiceDetailsById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params; // invoiceId viene de la URL (ej. /invoices/123/details)

    if (!invoiceId) {
      return res.status(400).json({ error: 'ID de factura es obligatorio.' });
    }

    const { data, error } = await supabase
      .from('invoicedetail')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('is_active', true) // Solo detalles activos
      .order('created_at', { ascending: true }); // Ordenar por fecha de creación

    if (error) {
      console.error('Error al obtener detalles de la factura:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No se encontraron detalles para la factura especificada.' });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Excepción en getInvoiceDetailsById:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 4. "Eliminar" una Factura y sus Detalles Asociados (Soft Delete)
export const deleteInvoice = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({ error: 'ID de factura es obligatorio para la eliminación.' });
    }

    // Primero, actualizar is_active a false para los detalles de la factura
    const { error: updateDetailsError } = await supabase
      .from('invoicedetail')
      .update({ is_active: false, updated_at: new Date().toISOString() }) // Actualizar también updated_at
      .eq('invoice_id', invoiceId);

    if (updateDetailsError) {
      console.error('Error al actualizar detalles de la factura a inactivos:', updateDetailsError);
      return res.status(500).json({ error: 'Error al actualizar los detalles de la factura.' });
    }

    // Luego, actualizar is_active a false para la factura principal
    const { error: updateInvoiceError } = await supabase
      .from('invoice')
      .update({ is_active: false, updated_at: new Date().toISOString() }) // Actualizar también updated_at
      .eq('invoice_id', invoiceId);

    if (updateInvoiceError) {
      console.error('Error al actualizar la factura principal a inactiva:', updateInvoiceError);
      return res.status(500).json({ error: 'Error al actualizar la factura principal.' });
    }

    res.status(200).json({ message: 'Factura y sus detalles marcados como inactivos exitosamente.' });

  } catch (err: any) {
    console.error('Excepción en deleteInvoice:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 5. Actualizar el estado 'is_payed' de una factura
export const updateInvoicePaymentStatus = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { is_payed }: UpdatePaymentStatusBody = req.body;

    // Validar que invoiceId sea proporcionado
    if (!invoiceId) {
      return res.status(400).json({ error: 'ID de factura es obligatorio para actualizar el estado de pago.' });
    }

    // Validar que is_payed sea un booleano
    if (typeof is_payed !== 'boolean') {
      return res.status(400).json({ error: 'El valor de "is_payed" debe ser un booleano (true/false).' });
    }

    // Actualizar el campo is_payed y updated_at
    const { data, error } = await supabase
      .from('invoice')
      .update({ is_payed: is_payed, updated_at: new Date().toISOString() })
      .eq('invoice_id', invoiceId)
      .select(); // Para obtener la factura actualizada

    if (error) {
      console.error('Error al actualizar el estado de pago de la factura:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Factura no encontrada o no se pudo actualizar.' });
    }

    res.status(200).json({
      message: 'Estado de pago de la factura actualizado exitosamente.',
      invoice: data[0],
    });

  } catch (err: any) {
    console.error('Excepción en updateInvoicePaymentStatus:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};