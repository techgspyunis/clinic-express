import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// Define the interface for the translation alias data
interface TranslationAliasData {
  translation_id: string;
  name: string;
}

/**
 * Checks if a translation alias with the same name already exists for a specific translation_id.
 * @param supabase Supabase client
 * @param translation_id The UUID of the associated translation record
 * @param name The alias name to check
 * @param excludeId Optional ID to exclude from the check (for update operations)
 * @returns true if the alias name exists for the translation, false otherwise
 */
const checkAliasNameExists = async (
  supabase: SupabaseClient,
  translation_id: string,
  name: string,
  excludeId?: string
) => {
  let query = supabase
    .from('translation_alias')
    .select('t_alias_id')
    .eq('translation_id', translation_id)
    .eq('name', name)
    .eq('is_active', true)
    .limit(1);

  if (excludeId) {
    query = query.neq('t_alias_id', excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data && data.length > 0;
};

/**
 * Endpoint to create a new translation alias record.
 * @param supabase Supabase client
 */
export const createTranslationAlias = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { translation_id, name }: TranslationAliasData = req.body;

    // 1. Input validation
    if (!translation_id || !name) {
      return res.status(400).json({ error: 'translation_id and name are required fields.' });
    }

    // 2. Check for unique alias name for the given translation_id
    const exists = await checkAliasNameExists(supabase, translation_id, name);
    if (exists) {
      return res.status(409).json({ error: `An alias with the name '${name}' already exists for this translation.` });
    }

    // 3. Insert the new record into the database
    const { data, error } = await supabase
      .from('translation_alias')
      .insert({ translation_id, name })
      .select();

    if (error) {
      console.error('Error creating translation alias:', error);
      return res.status(500).json({ error: 'Internal server error while creating the translation alias.' });
    }

    res.status(201).json({
      message: 'Translation alias created successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in createTranslationAlias:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get all active translation alias records for a specific translation.
 * @param supabase Supabase client
 */
export const getAllTranslationAliases = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { translationId } = req.params;

    // 1. Input validation
    if (!translationId) {
      return res.status(400).json({ error: 'The translation ID is required to fetch aliases.' });
    }

    // 2. Get all active records for the given translation ID, ordered by name
    const { data, error } = await supabase
      .from('translation_alias')
      .select('*')
      .eq('translation_id', translationId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching translation aliases:', error);
      return res.status(500).json({ error: 'Internal server error while fetching translation aliases.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getAllTranslationAliases:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get a specific translation alias record by its ID.
 * @param supabase Supabase client
 */
export const getTranslationAliasById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { aliasId } = req.params;

    // 1. Input validation
    if (!aliasId) {
      return res.status(400).json({ error: 'The translation alias ID is required.' });
    }

    // 2. Get the record by ID and ensure it is active
    const { data, error } = await supabase
      .from('translation_alias')
      .select('*')
      .eq('t_alias_id', aliasId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching translation alias by ID:', error);
      if (error.code === 'PGRST116') { // Code for "no rows found" in PostgREST
        return res.status(404).json({ error: 'Translation alias not found.' });
      }
      return res.status(500).json({ error: 'Internal server error.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getTranslationAliasById:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to update a translation alias record by its ID.
 * @param supabase Supabase client
 */
export const updateTranslationAlias = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { aliasId } = req.params;
    const { name }: Partial<TranslationAliasData> = req.body;

    // 1. Input validation
    if (!aliasId) {
      return res.status(400).json({ error: 'The translation alias ID is required.' });
    }

    if (!name) {
      return res.status(400).json({ error: 'The name field is required for the update.' });
    }

    // 2. Check for unique alias name for the given translation_id, excluding the current record
    const { data: currentAlias } = await supabase.from('translation_alias').select('translation_id').eq('t_alias_id', aliasId).single();
    if (currentAlias) {
      const exists = await checkAliasNameExists(supabase, currentAlias.translation_id, name, aliasId);
      if (exists) {
        return res.status(409).json({ error: `An alias with the name '${name}' already exists for this translation.` });
      }
    }

    // 3. Create the update object with the current date and name
    const updatePayload: any = {
      name,
      updated_at: new Date().toISOString()
    };

    // 4. Update the record
    const { data, error } = await supabase
      .from('translation_alias')
      .update(updatePayload)
      .eq('t_alias_id', aliasId)
      .select();

    if (error) {
      console.error('Error updating translation alias:', error);
      return res.status(500).json({ error: 'Internal server error while updating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Translation alias not found for update.' });
    }

    res.status(200).json({
      message: 'Translation alias updated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in updateTranslationAlias:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to deactivate (soft delete) a translation alias record by its ID.
 * @param supabase Supabase client
 */
export const deactivateTranslationAlias = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { aliasId } = req.params;

    // 1. Input validation
    if (!aliasId) {
      return res.status(400).json({ error: 'The translation alias ID is required.' });
    }

    // 2. Update the 'is_active' status to false
    const { data, error } = await supabase
      .from('translation_alias')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('t_alias_id', aliasId)
      .select();

    if (error) {
      console.error('Error deactivating the translation alias:', error);
      return res.status(500).json({ error: 'Internal server error while deactivating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Translation alias not found for deactivation.' });
    }

    res.status(200).json({
      message: 'Translation alias deactivated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in deactivateTranslationAlias:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
