import { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as unzipper from 'unzipper'; // Importamos unzipper

/**
 * Intenta descomprimir un buffer de archivo comprimido con o sin contraseña.
 * Actualmente solo soporta archivos .zip.
 * @param buffer El buffer del archivo comprimido (solo ZIP).
 * @param fileExtension La extensión original del archivo (ej. '.zip').
 * @param passwords Un array de contraseñas a probar.
 * @returns Un array de objetos { path: string, data: Buffer } para cada archivo descomprimido.
 * @throws Error si la descompresión falla o el formato no es soportado.
 */
export const decompressArchive = async (
  buffer: Buffer,
  fileExtension: string,
  passwords: string[] = []
): Promise<{ path: string; data: Buffer }[]> => {
  console.log(`Attempting to decompress file with extension: ${fileExtension}`);

  if (fileExtension !== '.zip') {
    throw new Error('Formato de archivo no soportado. Solo .zip es aceptado.');
  }

  let decompressedFiles: { path: string; data: Buffer }[] = [];
  let success = false;

  // Aseguramos que la lista de contraseñas incluya una cadena vacía para el intento sin contraseña
  // y que las contraseñas no estén duplicadas.
  const allPasswordsToTry = Array.from(new Set(['', ...passwords]));

  for (const pwd of allPasswordsToTry) {
    try {
      // unzipper.Open.buffer() es la forma de abrir un ZIP desde un buffer
      // La opción 'password' NO se pasa aquí.
      const directory = await unzipper.Open.buffer(buffer);

      // Filtrar solo archivos (no directorios) y leer sus contenidos
      // CAMBIO AQUÍ: Usamos file.type === 'Directory' en lugar de file.dir
      const files = directory.files.filter(file => file.type !== 'Directory'); 

      for (const file of files) {
        // La contraseña se pasa al método buffer() de cada entrada de archivo
        const fileData = await file.buffer(pwd);
        decompressedFiles.push({
          path: file.path,
          data: fileData,
        });
      }
      success = true;
      console.log(`Archivo descomprimido exitosamente con contraseña: ${pwd === '' ? 'ninguna' : pwd}`);
      break; // Salir del bucle si la descompresión fue exitosa
    } catch (error: any) {
      console.warn(`Intento de descompresión con contraseña "${pwd === '' ? 'ninguna' : pwd}" falló: ${error.message}`);
      // Si el error es por contraseña incorrecta, el bucle continuará.
      // Si es otro tipo de error (ej. archivo corrupto), podríamos querer lanzarlo.
      // Por ahora, solo lo registramos y seguimos intentando.
    }
  }

  if (!success) {
    throw new Error('No se pudo descomprimir el archivo. Contraseña incorrecta o archivo corrupto.');
  }

  return decompressedFiles;
};

/**
 * Sube un archivo (Buffer) a Supabase Storage.
 * @param supabase Cliente de Supabase.
 * @param bucketName Nombre del bucket de Supabase Storage.
 * @param filePath Ruta completa del archivo dentro del bucket (ej. 'lab_files/my_file.lab').
 * @param fileBuffer El contenido del archivo como Buffer.
 * @param contentType El tipo de contenido del archivo (ej. 'text/plain', 'application/octet-stream').
 * @returns La URL pública del archivo subido.
 */
export const uploadFileToSupabaseStorage = async (
  supabase: SupabaseClient,
  bucketName: string,
  filePath: string,
  fileBuffer: Buffer,
  contentType: string = 'application/octet-stream'
): Promise<string> => {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        contentType: contentType,
        upsert: true, // Sobrescribe si el archivo ya existe
      });

    if (error) {
      console.error('Error al subir archivo a Supabase Storage:', error);
      throw new Error(`Error al subir archivo a Storage: ${error.message}`);
    }

    // Obtener la URL pública del archivo
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      throw new Error('No se pudo obtener la URL pública del archivo subido.');
    }

    return publicUrlData.publicUrl;
  } catch (err: any) {
    console.error('Excepción en uploadFileToSupabaseStorage:', err);
    throw err;
  }
};