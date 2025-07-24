import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { parseLabFile } from '../utils/labFileParser'; // Import the parser
import { decompressArchive, uploadFileToSupabaseStorage } from '../utils/archiveHandler'; // Import the file handler
import { FilePasswordService } from '../services/filePasswordService'; // Import the password service
import * as path from 'path'; // To handle file paths

// --- Interfaces for data structure ---

// Interface for a result detail in the request
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

// Interface for the administrative header in the request (includes its results)
interface AdministrativeInput {
  invoicedetail_id?: string | null; // Can be null
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
  empty_field?: string | null; // 'vide' field in the document
  protocol_type?: string | null;
  cover?: string | null;
  holder?: string | null;
  cod_tit1?: string | null;
  cod_tit2?: string | null;
  file_name?: string | null; // This will be added by us when saving the file
  status?: number | null; // The document does not define it, but your table does
  zip_uploaded?: string | null; // NEW: Name of the uploaded ZIP file
  results?: ResultInput[]; // Array of result details (optional for file upload)
}

// --- Controller Functions ---

// 1. Create a new Administrative Record with its Results
export const createAdministrativeWithResults = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { results, ...administrativeData }: AdministrativeInput = req.body;

    // Validate basic input data for the header (you can add more validations as needed)
    if (!results || results.length === 0) {
      return res.status(400).json({ error: 'At least one result detail is required.' });
    }

    // Validate that all result details have the required fields
    for (const result of results) {
      if (!result.type || !result.ident_protocol || !result.analytical_code || !result.analytical_name || !result.reference_value || !result.unit || !result.code || !result.result) {
        return res.status(400).json({ error: 'All required fields in result details are mandatory.' });
      }
    }

    // Insert the administrative header
    const { data: adminData, error: adminError } = await supabase
      .from('administrative')
      .insert({
        ...administrativeData,
        // created_at, updated_at, is_active are handled by default in the table
      })
      .select('administrative_id'); // We only need the administrative_id for the details

    if (adminError || !adminData || adminData.length === 0) {
      console.error('Error creating administrative record:', adminError);
      return res.status(500).json({ error: 'Error creating the main administrative record.' });
    }

    const administrative_id = adminData[0].administrative_id;

    // Prepare the results for insertion
    const resultsToInsert = results.map(result => ({
      ...result,
      administrative_id: administrative_id, // Assign the newly created administrative ID
      // created_at, updated_at, is_active are handled by default in the table
    }));

    // Insert the result details
    const { data: resultData, error: resultError } = await supabase
      .from('result')
      .insert(resultsToInsert)
      .select(); // Select all fields of the inserted details

    if (resultError) {
      console.error('Error creating result details:', resultError);
      // If details fail, we revert the creation of the main administrative record.
      await supabase.from('administrative').delete().eq('administrative_id', administrative_id);
      return res.status(500).json({ error: 'Error creating result details. The main administrative record was reverted.' });
    }

    res.status(201).json({
      message: 'Administrative record and results created successfully.',
      administrative: adminData[0],
      results: resultData,
    });

  } catch (err: any) {
    console.error('Exception in createAdministrativeWithResults:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 2. Get all Administrative Records (headers only)
export const getAllAdministratives = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('administrative')
      .select('*')
      .eq('is_active', true) // Only active records
      .order('created_at', { ascending: false }); // Order by creation date

    if (error) {
      console.error('Error getting administrative records:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Exception in getAllAdministratives:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 3. Get Result Details of a Specific Administrative Record by administrative_id
export const getAdministrativeResultsById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { administrativeId } = req.params; // administrativeId comes from the URL

    if (!administrativeId) {
      return res.status(400).json({ error: 'Administrative ID is required.' });
    }

    const { data, error } = await supabase
      .from('result')
      .select('*')
      .eq('administrative_id', administrativeId)
      .eq('is_active', true) // Only active details
      .order('created_at', { ascending: true }); // Order by creation date

    if (error) {
      console.error('Error getting administrative record result details:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No results found for the specified administrative record.' });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Exception in getAdministrativeResultsById:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 4. "Delete" an Administrative Record and its Associated Results (Soft Delete)
export const deleteAdministrative = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { administrativeId } = req.params;

    if (!administrativeId) {
      return res.status(400).json({ error: 'Administrative ID is required for deletion.' });
    }

    // First, update is_active to false for the associated results
    const { error: updateResultsError } = await supabase
      .from('result')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('administrative_id', administrativeId);

    if (updateResultsError) {
      console.error('Error updating results to inactive:', updateResultsError);
      return res.status(500).json({ error: 'Error updating associated results.' });
    }

    // Then, update is_active to false for the main administrative record
    const { error: updateAdminError } = await supabase
      .from('administrative')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('administrative_id', administrativeId);

    if (updateAdminError) {
      console.error('Error updating main administrative record to inactive:', updateAdminError);
      return res.status(500).json({ error: 'Error updating the main administrative record.' });
    }

    res.status(200).json({ message: 'Administrative record and its results successfully marked as inactive.' });

  } catch (err: any) {
    console.error('Exception in deleteAdministrative:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 5. Upload and Process Compressed LAB File
export const uploadLabFile = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const uploadedFile = req.file;
    const invoicedetail_id: string | null = req.body.invoicedetail_id || null;

    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file has been uploaded.' });
    }

    const fileExtension = path.extname(uploadedFile.originalname).toLowerCase();
    const allowedExtensions = ['.zip'];

    if (!allowedExtensions.includes(fileExtension)) {
      return res.status(400).json({ error: `Unsupported file format: ${fileExtension}. Only ${allowedExtensions.join(', ')} are allowed.` });
    }

    const zipFileName = uploadedFile.originalname; // Original name of the ZIP file

    // --- NEW VALIDATION: Check if the ZIP file has already been uploaded and is active ---
    const { data: existingZipRecords, error: zipCheckError } = await supabase
      .from('administrative')
      .select('administrative_id')
      .eq('zip_uploaded', zipFileName)
      .eq('is_active', true);

    if (zipCheckError) {
      console.error('Error checking for duplicate ZIP:', zipCheckError);
      return res.status(500).json({ error: 'Internal error checking for duplicate ZIP files.' });
    }

    if (existingZipRecords && existingZipRecords.length > 0) {
      return res.status(409).json({ error: `The ZIP file "${zipFileName}" has already been uploaded and is active.` });
    }
    // --- END NEW VALIDATION ---

    let decompressedFiles: { path: string; data: Buffer }[] = [];
    let passwordsToTry: string[] = [];

    try {
      passwordsToTry = await FilePasswordService.getAllActivePasswords(supabase);
      passwordsToTry.unshift(''); // Add an empty string to try without password first

      decompressedFiles = await decompressArchive(uploadedFile.buffer, fileExtension, passwordsToTry);

    } catch (decompressionError: any) {
      console.error('Error during decompression:', decompressionError.message);
      return res.status(400).json({ error: `Error decompressing the file: ${decompressionError.message}. Verify password or format.` });
    }

    const processedRecords: { administrativeId: string; labFileName: string; storageUrl: string; }[] = [];
    const errors: string[] = [];
    const skippedFiles: string[] = []; // To record skipped .lab files

    // 3. Process each decompressed .lab file
    for (const file of decompressedFiles) {
      if (path.extname(file.path).toLowerCase() !== '.lab') {
        console.warn(`File ignored (not .lab): ${file.path}`);
        continue;
      }

      const labFileName = path.basename(file.path);
      let storageUrl: string | null = null;
      let parsedBlocks;

      // --- NEW VALIDATION: Check if the .lab file content already exists and is active ---
      // Note: This validation assumes 'file_name' in DB stores the full storage URL.
      // We need to query by the original lab file name from the zip.
      // A more robust solution might involve hashing the file content or storing just the labFileName.
      // For now, we'll query by the base name of the lab file.
      const { data: existingLabFileRecords, error: labFileCheckError } = await supabase
        .from('administrative')
        .select('administrative_id')
        .ilike('file_name', `%${labFileName}`) // Use ilike for case-insensitive and partial match on URL
        .eq('is_active', true);

      if (labFileCheckError) {
        console.error(`Error checking for duplicate .lab file for ${labFileName}:`, labFileCheckError);
        errors.push(`Internal error checking for duplicate for ${labFileName}.`);
        continue;
      }

      if (existingLabFileRecords && existingLabFileRecords.length > 0) {
        skippedFiles.push(labFileName);
        console.warn(`The .lab file "${labFileName}" already exists and is active. Insertion will be skipped.`);
        continue; // Skip insertion if it already exists
      }
      // --- END NEW VALIDATION ---

      try {
        // Upload the original .lab file to Supabase Storage
        const storagePath = `lab_files/${Date.now()}_${labFileName}`; // Unique path to avoid direct name collisions in storage
        storageUrl = await uploadFileToSupabaseStorage(supabase, 'lab-files', storagePath, file.data, 'text/plain');

        // Parse the content of the .lab file
        const fileContent = file.data.toString('utf8');
        parsedBlocks = parseLabFile(fileContent);

      } catch (parseOrStorageError: any) {
        console.error(`Error processing file ${labFileName}:`, parseOrStorageError.message);
        errors.push(`Error processing ${labFileName}: ${parseOrStorageError.message}`);
        continue;
      }

      // 4. Insert data into administrative and result tables
      for (const block of parsedBlocks) {
        try {
          // Prepare administrative data
          const adminToInsert = {
            ...block.administrative,
            invoicedetail_id: invoicedetail_id,
            file_name: storageUrl, // Save the LAB file URL in the administrative header
            zip_uploaded: zipFileName, // NEW: Save the name of the uploaded ZIP
            status: block.administrative.status || 0,
          };

          const { data: adminData, error: adminInsertError } = await supabase
            .from('administrative')
            .insert(adminToInsert)
            .select('administrative_id');

          if (adminInsertError || !adminData || adminData.length === 0) {
            throw new Error(`Error inserting administrative record: ${adminInsertError?.message}`);
          }

          const administrative_id = adminData[0].administrative_id;

          // Prepare and insert results
          const resultsToInsert = block.results.map(result => ({
            ...result,
            administrative_id: administrative_id,
          }));

          const { error: resultInsertError } = await supabase
            .from('result')
            .insert(resultsToInsert);

          if (resultInsertError) {
            throw new Error(`Error inserting results: ${resultInsertError.message}`);
          }

          processedRecords.push({ administrativeId: administrative_id, labFileName: labFileName, storageUrl: storageUrl });

        } catch (dbError: any) {
          console.error(`Error inserting DB data for ${labFileName}:`, dbError.message);
          errors.push(`Error inserting data for ${labFileName} in DB: ${dbError.message}`);
        }
      }
    }

    res.status(200).json({
      message: 'LAB file processing completed.',
      processedFilesCount: processedRecords.length,
      totalErrors: errors.length,
      skippedFiles: skippedFiles, // NEW: List of skipped .lab files
      processedRecords: processedRecords,
      errors: errors,
    });

  } catch (err: any) {
    console.error('Exception in uploadLabFile:', err);
    res.status(500).json({ error: 'Internal server error processing the LAB file.' });
  }
};
