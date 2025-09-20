import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Endpoint to get financial analysis data.
 * Calls a database function with year and month filters.
 * @param supabase Supabase client
 */
export const getFinancialAnalysis = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'The year and month parameters are mandatory.' });
    }

    const yearNumber = parseInt(year as string, 10);
    const monthNumber = parseInt(month as string, 10);

    // Call the database function using the rpc method
    const { data, error } = await supabase.rpc('get_financial_analysis_data', {
      _year: yearNumber,
      _month: monthNumber,
    });

    if (error) {
      console.error('Error calling the database function:', error);
      return res.status(500).json({ error: 'Internal server error while fetching analysis data.' });
    }

    res.status(200).json(data);
    
  } catch (err: any) {
    console.error('Exception in getFinancialAnalysis:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
