import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// Define the interface for medical center data
interface MedicalCenterData {
  name: string;
  abbreviation: string;
}

/**
 * Endpoint to create a new medical center.
 * @param supabase Supabase client
 */
export const createMedicalCenter = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { name, abbreviation }: MedicalCenterData = req.body;

    // 1. Input validation
    if (!name || !abbreviation) {
      return res.status(400).json({ error: 'Name and abbreviation are required fields.' });
    }

    // 2. Insert the new medical center into the database
    const { data, error } = await supabase
      .from('centremedical')
      .insert({ name, abbreviation })
      .select();

    if (error) {
      console.error('Error creating the medical center:', error);
      return res.status(500).json({ error: 'Internal server error while creating the medical center.' });
    }

    res.status(201).json({
      message: 'Medical center created successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in createMedicalCenter:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get all active medical centers.
 * @param supabase Supabase client
 */
export const getAllMedicalCenters = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    // 1. Get all medical centers that are active
    const { data, error } = await supabase
      .from('centremedical')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true }); // Order by name for better visualization

    if (error) {
      console.error('Error fetching medical centers:', error);
      return res.status(500).json({ error: 'Internal server error while fetching medical centers.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getAllMedicalCenters:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to get a specific medical center by its ID.
 * @param supabase Supabase client
 */
export const getMedicalCenterById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { centreId } = req.params;

    // 1. Input validation
    if (!centreId) {
      return res.status(400).json({ error: 'The medical center ID is required.' });
    }

    // 2. Get the medical center by ID and ensure it is active
    const { data, error } = await supabase
      .from('centremedical')
      .select('*')
      .eq('centre_id', centreId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching medical center by ID:', error);
      if (error.code === 'PGRST116') { // Code for "no rows found" in PostgREST
        return res.status(404).json({ error: 'Medical center not found.' });
      }
      return res.status(500).json({ error: 'Internal server error.' });
    }

    res.status(200).json(data);

  } catch (err: any) {
    console.error('Exception in getMedicalCenterById:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Endpoint to update a medical center by its ID.
 * @param supabase Supabase client
 */
export const updateMedicalCenter = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { centreId } = req.params;
    const { name, abbreviation }: MedicalCenterData = req.body;

    // 1. Input validation
    if (!centreId) {
      return res.status(400).json({ error: 'The medical center ID is required.' });
    }

    if (!name && !abbreviation) {
      return res.status(400).json({ error: 'At least one field (name or abbreviation) is required for the update.' });
    }
    
    // 2. Create the update object with the current date
    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (name) updatePayload.name = name;
    if (abbreviation) updatePayload.abbreviation = abbreviation;

    // 3. Update the medical center
    const { data, error } = await supabase
      .from('centremedical')
      .update(updatePayload)
      .eq('centre_id', centreId)
      .select();

    if (error) {
      console.error('Error updating the medical center:', error);
      return res.status(500).json({ error: 'Internal server error while updating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Medical center not found for update.' });
    }

    res.status(200).json({
      message: 'Medical center updated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in updateMedicalCenter:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


/**
 * Endpoint to deactivate (soft delete) a medical center by its ID.
 * @param supabase Supabase client
 */
export const deactivateMedicalCenter = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { centreId } = req.params;

    // 1. Input validation
    if (!centreId) {
      return res.status(400).json({ error: 'The medical center ID is required.' });
    }
    
    // 2. Update the 'is_active' status to false
    const { data, error } = await supabase
      .from('centremedical')
      .update({ is_active: false })
      .eq('centre_id', centreId)
      .select();

    if (error) {
      console.error('Error deactivating the medical center:', error);
      return res.status(500).json({ error: 'Internal server error while deactivating.' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Medical center not found for deactivation.' });
    }

    res.status(200).json({
      message: 'Medical center deactivated successfully.',
      data: data[0],
    });

  } catch (err: any) {
    console.error('Exception in deactivateMedicalCenter:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
