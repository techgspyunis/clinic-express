import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { parseLabFile } from '../utils/labFileParser'; // Importar el parser
import { decompressArchive, uploadFileToSupabaseStorage } from '../utils/archiveHandler'; // Importar el manejador de archivos
import { FilePasswordService } from '../services/filePasswordService'; // Importar el servicio de contraseñas
import * as path from 'path'; // Para manejar rutas de archivos

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
  empty_field?: string | null; // Campo 'vide' en el documento
  protocol_type?: string | null;
  cover?: string | null;
  holder?: string | null;
  cod_tit1?: string | null;
  cod_tit2?: string | null;
  file_name?: string | null; // Este lo añadiremos nosotros al guardar el archivo
  status?: number | null; // El documento no lo define, pero tu tabla sí
  zip_uploaded?: string | null; // NUEVO: Nombre del archivo ZIP subido
  results?: ResultInput[]; // Array de los detalles de resultados (opcional para la subida de archivo)
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
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }

    res.status(200).json({ message: 'Registro administrativo y sus resultados marcados como inactivos exitosamente.' });

  } catch (err: any) {
    console.error('Excepción en deleteAdministrative:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 5. Subir y Procesar Archivo LAB Comprimido
export const uploadLabFile = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const uploadedFile = req.file;
    const invoicedetail_id: string | null = req.body.invoicedetail_id || null;

    if (!uploadedFile) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    }

    const fileExtension = path.extname(uploadedFile.originalname).toLowerCase();
    const allowedExtensions = ['.zip'];

    if (!allowedExtensions.includes(fileExtension)) {
      return res.status(400).json({ error: `Formato de archivo no soportado: ${fileExtension}. Solo se permiten ${allowedExtensions.join(', ')}.` });
    }

    const zipFileName = uploadedFile.originalname; // Nombre original del archivo ZIP

    // --- NUEVA VALIDACIÓN: Verificar si el archivo ZIP ya fue subido y está activo ---
    const { data: existingZipRecords, error: zipCheckError } = await supabase
      .from('administrative')
      .select('administrative_id')
      .eq('zip_uploaded', zipFileName)
      .eq('is_active', true);

    if (zipCheckError) {
      console.error('Error al verificar ZIP duplicado:', zipCheckError);
      return res.status(500).json({ error: 'Error interno al verificar archivos ZIP duplicados.' });
    }

    if (existingZipRecords && existingZipRecords.length > 0) {
      return res.status(409).json({ error: `El archivo ZIP "${zipFileName}" ya ha sido subido y está activo.` });
    }
    // --- FIN NUEVA VALIDACIÓN ---

    let decompressedFiles: { path: string; data: Buffer }[] = [];
    let passwordsToTry: string[] = [];

    try {
      passwordsToTry = await FilePasswordService.getAllActivePasswords(supabase);
      passwordsToTry.unshift('');

      decompressedFiles = await decompressArchive(uploadedFile.buffer, fileExtension, passwordsToTry);

    } catch (decompressionError: any) {
      console.error('Error durante la descompresión:', decompressionError.message);
      return res.status(400).json({ error: `Error al descomprimir el archivo: ${decompressionError.message}. Verifique la contraseña o el formato.` });
    }

    const processedRecords: { administrativeId: string; labFileName: string; storageUrl: string; }[] = [];
    const errors: string[] = [];
    const skippedFiles: string[] = []; // Para registrar archivos .lab omitidos

    // 3. Procesar cada archivo .lab descomprimido
    for (const file of decompressedFiles) {
      if (path.extname(file.path).toLowerCase() !== '.lab') {
        console.warn(`Archivo ignorado (no es .lab): ${file.path}`);
        continue;
      }

      const labFileName = path.basename(file.path);
      let storageUrl: string | null = null;
      let parsedBlocks;

      // --- NUEVA VALIDACIÓN: Verificar si el archivo .lab ya existe y está activo ---
      const { data: existingLabFileRecords, error: labFileCheckError } = await supabase
        .from('administrative')
        .select('administrative_id')
        .eq('file_name', `lab_files/${labFileName}`) // Asume que la URL en DB contendrá el nombre del archivo
        .eq('is_active', true);

      if (labFileCheckError) {
        console.error(`Error al verificar archivo .lab duplicado para ${labFileName}:`, labFileCheckError);
        errors.push(`Error interno al verificar duplicado para ${labFileName}.`);
        continue;
      }

      if (existingLabFileRecords && existingLabFileRecords.length > 0) {
        skippedFiles.push(labFileName);
        console.warn(`Archivo .lab "${labFileName}" ya existe y está activo. Se omitirá la inserción.`);
        continue; // Saltar la inserción si ya existe
      }
      // --- FIN NUEVA VALIDACIÓN ---

      try {
        // Subir el archivo .lab original a Supabase Storage
        const storagePath = `lab_files/${Date.now()}_${labFileName}`;
        storageUrl = await uploadFileToSupabaseStorage(supabase, 'lab-files', storagePath, file.data, 'text/plain');

        // Parsear el contenido del archivo .lab
        const fileContent = file.data.toString('utf8');
        parsedBlocks = parseLabFile(fileContent);

      } catch (parseOrStorageError: any) {
        console.error(`Error al procesar el archivo ${labFileName}:`, parseOrStorageError.message);
        errors.push(`Error al procesar ${labFileName}: ${parseOrStorageError.message}`);
        continue;
      }

      // 4. Insertar datos en las tablas administrative y result
      for (const block of parsedBlocks) {
        try {
          // Preparar datos administrativos
          const adminToInsert = {
            ...block.administrative,
            invoicedetail_id: invoicedetail_id,
            file_name: storageUrl, // Guardar la URL del archivo LAB en la cabecera administrativa
            zip_uploaded: zipFileName, // NUEVO: Guardar el nombre del ZIP subido
            status: block.administrative.status || 0,
          };

          const { data: adminData, error: adminInsertError } = await supabase
            .from('administrative')
            .insert(adminToInsert)
            .select('administrative_id');

          if (adminInsertError || !adminData || adminData.length === 0) {
            throw new Error(`Error al insertar registro administrativo: ${adminInsertError?.message}`);
          }

          const administrative_id = adminData[0].administrative_id;

          // Preparar y insertar resultados
          const resultsToInsert = block.results.map(result => ({
            ...result,
            administrative_id: administrative_id,
          }));

          const { error: resultInsertError } = await supabase
            .from('result')
            .insert(resultsToInsert);

          if (resultInsertError) {
            throw new Error(`Error al insertar resultados: ${resultInsertError.message}`);
          }

          processedRecords.push({ administrativeId: administrative_id, labFileName: labFileName, storageUrl: storageUrl });

        } catch (dbError: any) {
          console.error(`Error al insertar datos de DB para ${labFileName}:`, dbError.message);
          errors.push(`Error al insertar datos de ${labFileName} en DB: ${dbError.message}`);
        }
      }
    }

    res.status(200).json({
      message: 'Procesamiento de archivo LAB completado.',
      processedFilesCount: processedRecords.length,
      totalErrors: errors.length,
      skippedFiles: skippedFiles, // NUEVO: Lista de archivos .lab omitidos
      processedRecords: processedRecords,
      errors: errors,
    });

  } catch (err: any) {
    console.error('Excepción en uploadLabFile:', err);
    res.status(500).json({ error: 'Error interno del servidor al procesar el archivo LAB.' });
  }
};