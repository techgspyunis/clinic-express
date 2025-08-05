import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// Define the interface for the translation laboratory data
interface TranslationLaboData {
  code: string;
  price: number;
}

/**
 * Endpoint to create a new translation laboratory record.
 * @param supabase Supabase client
 */
export const createTranslationLabo = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { code, price }: TranslationLaboData = req.body;

    // 1. Input validation
    if (!code || price === undefined) {
      return res.status(400).json({ error: 'Code and price are required fields.' });
    }

    // 2. Insert the new record into the database
    const { data, error } = await supabase
      .from('translation_labo')
      .insert({ code, price })
      .select();

    if (error) {
      console.error('Error creating translation laboratory:', error);
      return res.status(500).json({ error: 'Internal server error while creating the translation laboratory.' });
    }

    res.status(201).json({
      message: 'Translation laboratory created successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in createTranslationLabo:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get all active translation laboratory records.
 * @param supabase Supabase client
 */
export const getAllTranslationLabo = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    // 1. Get all records that are active
    const { data, error } = await supabase
      .from('translation_labo')
      .select('*')
      .eq('is_active', true)
      .order('code', { ascending: true }); // Order by code for better visualization

    if (error) {
      console.error('Error fetching translation laboratories:', error);
      return res.status(500).json({ error: 'Internal server error while fetching translation laboratories.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getAllTranslationLabo:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get a specific translation laboratory record by its ID.
 * @param supabase Supabase client
 */
export const getTranslationLaboById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { laboId } = req.params;

    // 1. Input validation
    if (!laboId) {
      return res.status(400).json({ error: 'The translation laboratory ID is required.' });
    }

    // 2. Get the record by ID and ensure it is active
    const { data, error } = await supabase
      .from('translation_labo')
      .select('*')
      .eq('labo_id', laboId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching translation laboratory by ID:', error);
      if (error.code === 'PGRST116') { // Code for "no rows found" in PostgREST
        return res.status(404).json({ error: 'Translation laboratory not found.' });
      }
      return res.status(500).json({ error: 'Internal server error.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getTranslationLaboById:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to update a translation laboratory record by its ID.
 * @param supabase Supabase client
 */
export const updateTranslationLabo = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { laboId } = req.params;
    const { code, price }: Partial<TranslationLaboData> = req.body;

    // 1. Input validation
    if (!laboId) {
      return res.status(400).json({ error: 'The translation laboratory ID is required.' });
    }

    if (!code && price === undefined) {
      return res.status(400).json({ error: 'At least one field (code or price) is required for the update.' });
    }
    
    // 2. Create the update object with the current date
    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (code) updatePayload.code = code;
    if (price !== undefined) updatePayload.price = price;

    // 3. Update the record
    const { data, error } = await supabase
      .from('translation_labo')
      .update(updatePayload)
      .eq('labo_id', laboId)
      .select();

    if (error) {
      console.error('Error updating translation laboratory:', error);
      return res.status(500).json({ error: 'Internal server error while updating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Translation laboratory not found for update.' });
    }

    res.status(200).json({
      message: 'Translation laboratory updated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in updateTranslationLabo:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


/**
 * Endpoint to deactivate (soft delete) a translation laboratory record by its ID.
 * @param supabase Supabase client
 */
export const deactivateTranslationLabo = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { laboId } = req.params;

    // 1. Input validation
    if (!laboId) {
      return res.status(400).json({ error: 'The translation laboratory ID is required.' });
    }
    
    // 2. Update the 'is_active' status to false
    const { data, error } = await supabase
      .from('translation_labo')
      .update({ is_active: false })
      .eq('labo_id', laboId)
      .select();

    if (error) {
      console.error('Error deactivating the translation laboratory:', error);
      return res.status(500).json({ error: 'Internal server error while deactivating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Translation laboratory not found for deactivation.' });
    }

    res.status(200).json({
      message: 'Translation laboratory deactivated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in deactivateTranslationLabo:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
