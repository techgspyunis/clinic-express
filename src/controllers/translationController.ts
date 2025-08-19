import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// Define the interface for the translation data
interface TranslationData {
  name: string;
  code_labo: string;
  code_hw: string;
}

/**
 * Checks if a combination of code_labo and code_hw already exists for an active record.
 * @param supabase Supabase client
 * @param code_labo The laboratory code to check
 * @param code_hw The hardware code to check
 * @param excludeId Optional ID to exclude from the check (for update operations)
 * @returns true if the combination exists, false otherwise
 */
const checkCombinationExists = async (
  supabase: SupabaseClient,
  code_labo: string,
  code_hw: string,
  excludeId?: string
) => {
  let query = supabase
    .from('translation')
    .select('translation_id')
    .eq('code_labo', code_labo)
    .eq('code_hw', code_hw)
    .eq('is_active', true)
    .limit(1);

  if (excludeId) {
    query = query.neq('translation_id', excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data && data.length > 0;
};

/**
 * Endpoint to create a new translation record.
 * @param supabase Supabase client
 */
export const createTranslation = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { name, code_labo, code_hw }: TranslationData = req.body;

    // 1. Input validation
    if (!name || !code_labo || !code_hw) {
      return res.status(400).json({ error: 'Name, code_labo, and code_hw are required fields.' });
    }

    // 2. Check for unique combination before inserting
    const exists = await checkCombinationExists(supabase, code_labo, code_hw);
    if (exists) {
      return res.status(409).json({ error: `A translation with the combination of code_labo '${code_labo}' and code_hw '${code_hw}' already exists.` });
    }

    // 3. Insert the new record into the database
    const { data: translationData, error: translationError} = await supabase
      .from('translation')
      .insert({ name, code_labo, code_hw })
      .select();

    if (translationError) {
      console.error('Error creating translation:', translationError);
      return res.status(500).json({ error: 'Internal server error while creating the translation.' });
    }

    const newTranslation = translationData[0];
    const translationId = newTranslation.translation_id;

    // 4. Insert the default alias using the new translation's ID and name
    const { error: aliasError } = await supabase
      .from('translation_alias')
      .insert({ translation_id: translationId, name: newTranslation.name });

    if (aliasError) {
      console.error('Error creating default alias:', aliasError);
      // Optional: Handle cleanup of the parent record if alias creation fails
      return res.status(500).json({ error: 'Internal server error while creating the default alias.' });
    }

    res.status(201).json({
      message: 'Translation created successfully.',
      data: newTranslation
    });

  } catch (err: any) {
    console.error('Exception in createTranslation:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get all active translation records.
 * @param supabase Supabase client
 */
export const getAllTranslations = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    // 1. Get all records that are active
    const { data, error } = await supabase
      .from('translation')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching translations:', error);
      return res.status(500).json({ error: 'Internal server error while fetching translations.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getAllTranslations:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get a specific translation record by its ID.
 * @param supabase Supabase client
 */
export const getTranslationById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { translationId } = req.params;

    // 1. Input validation
    if (!translationId) {
      return res.status(400).json({ error: 'The translation ID is required.' });
    }

    // 2. Get the record by ID and ensure it is active
    const { data, error } = await supabase
      .from('translation')
      .select('*')
      .eq('translation_id', translationId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching translation by ID:', error);
      if (error.code === 'PGRST116') { // Code for "no rows found" in PostgREST
        return res.status(404).json({ error: 'Translation not found.' });
      }
      return res.status(500).json({ error: 'Internal server error.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getTranslationById:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to update a translation record by its ID.
 * @param supabase Supabase client
 */
export const updateTranslation = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { translationId } = req.params;
    const { name, code_labo, code_hw }: Partial<TranslationData> = req.body;

    // 1. Input validation
    if (!translationId) {
      return res.status(400).json({ error: 'The translation ID is required.' });
    }

    if (!name && !code_labo && !code_hw) {
      return res.status(400).json({ error: 'At least one field (name, code_labo, or code_hw) is required for the update.' });
    }
    
    // 2. If codes are being updated, check for unique combination
    if (code_labo || code_hw) {
      const currentTranslation = await supabase.from('translation').select('code_labo, code_hw').eq('translation_id', translationId).single();
      const updatedCodeLabo = code_labo || currentTranslation.data?.code_labo;
      const updatedCodeHw = code_hw || currentTranslation.data?.code_hw;

      const exists = await checkCombinationExists(supabase, updatedCodeLabo!, updatedCodeHw!, translationId);
      if (exists) {
        return res.status(409).json({ error: `A translation with the combination of code_labo '${updatedCodeLabo}' and code_hw '${updatedCodeHw}' already exists.` });
      }
    }

    // 3. Create the update object with the current date
    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (name) updatePayload.name = name;
    if (code_labo) updatePayload.code_labo = code_labo;
    if (code_hw) updatePayload.code_hw = code_hw;

    // 4. Update the record
    const { data, error } = await supabase
      .from('translation')
      .update(updatePayload)
      .eq('translation_id', translationId)
      .select();

    if (error) {
      console.error('Error updating translation:', error);
      return res.status(500).json({ error: 'Internal server error while updating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Translation not found for update.' });
    }

    res.status(200).json({
      message: 'Translation updated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in updateTranslation:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to deactivate (soft delete) a translation record by its ID.
 * @param supabase Supabase client
 */
export const deactivateTranslation = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { translationId } = req.params;

    // 1. Input validation
    if (!translationId) {
      return res.status(400).json({ error: 'The translation ID is required.' });
    }
    
    // 2. Update the 'is_active' status to false
    const { data, error } = await supabase
      .from('translation')
      .update({ is_active: false })
      .eq('translation_id', translationId)
      .select();

    if (error) {
      console.error('Error deactivating the translation:', error);
      return res.status(500).json({ error: 'Internal server error while deactivating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Translation not found for deactivation.' });
    }

    res.status(200).json({
      message: 'Translation deactivated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in deactivateTranslation:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
