import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// Define the interface for the translation hardware data
interface TranslationHwData {
  code: string;
  price: number;
}

/**
 * Endpoint to create a new translation hardware record.
 * @param supabase Supabase client
 */
export const createTranslationHw = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { code, price }: TranslationHwData = req.body;

    // 1. Input validation
    if (!code || price === undefined) {
      return res.status(400).json({ error: 'Code and price are required fields.' });
    }

    // 2. Insert the new record into the database
    const { data, error } = await supabase
      .from('translation_hw')
      .insert({ code, price })
      .select();

    if (error) {
      console.error('Error creating translation hardware:', error);
      return res.status(500).json({ error: 'Internal server error while creating the translation hardware.' });
    }

    res.status(201).json({
      message: 'Translation hardware created successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in createTranslationHw:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get all active translation hardware records.
 * @param supabase Supabase client
 */
export const getAllTranslationHw = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    // 1. Get all records that are active
    const { data, error } = await supabase
      .from('translation_hw')
      .select('*')
      .eq('is_active', true)
      .order('code', { ascending: true }); // Order by code for better visualization

    if (error) {
      console.error('Error fetching translation hardware:', error);
      return res.status(500).json({ error: 'Internal server error while fetching translation hardware.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getAllTranslationHw:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get a specific translation hardware record by its ID.
 * @param supabase Supabase client
 */
export const getTranslationHwById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { hwId } = req.params;

    // 1. Input validation
    if (!hwId) {
      return res.status(400).json({ error: 'The translation hardware ID is required.' });
    }

    // 2. Get the record by ID and ensure it is active
    const { data, error } = await supabase
      .from('translation_hw')
      .select('*')
      .eq('hw_id', hwId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching translation hardware by ID:', error);
      if (error.code === 'PGRST116') { // Code for "no rows found" in PostgREST
        return res.status(404).json({ error: 'Translation hardware not found.' });
      }
      return res.status(500).json({ error: 'Internal server error.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getTranslationHwById:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to update a translation hardware record by its ID.
 * @param supabase Supabase client
 */
export const updateTranslationHw = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { hwId } = req.params;
    const { code, price }: Partial<TranslationHwData> = req.body;

    // 1. Input validation
    if (!hwId) {
      return res.status(400).json({ error: 'The translation hardware ID is required.' });
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
      .from('translation_hw')
      .update(updatePayload)
      .eq('hw_id', hwId)
      .select();

    if (error) {
      console.error('Error updating translation hardware:', error);
      return res.status(500).json({ error: 'Internal server error while updating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Translation hardware not found for update.' });
    }

    res.status(200).json({
      message: 'Translation hardware updated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in updateTranslationHw:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


/**
 * Endpoint to deactivate (soft delete) a translation hardware record by its ID.
 * @param supabase Supabase client
 */
export const deactivateTranslationHw = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { hwId } = req.params;

    // 1. Input validation
    if (!hwId) {
      return res.status(400).json({ error: 'The translation hardware ID is required.' });
    }
    
    // 2. Update the 'is_active' status to false
    const { data, error } = await supabase
      .from('translation_hw')
      .update({ is_active: false })
      .eq('hw_id', hwId)
      .select();

    if (error) {
      console.error('Error deactivating the translation hardware:', error);
      return res.status(500).json({ error: 'Internal server error while deactivating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Translation hardware not found for deactivation.' });
    }

    res.status(200).json({
      message: 'Translation hardware deactivated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in deactivateTranslationHw:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
