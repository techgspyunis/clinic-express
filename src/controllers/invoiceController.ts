import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// --- Interfaces for data structure ---

// Interface for an invoice detail in the request
interface InvoiceDetailInput {
  demande: string;
  name_patient: string;
  date_prel: string;
  ref_patient: string;
  montant: number; // Numeric in DB, handled as number in TS
  unknow?: string | null; // Can be null
}

// Interface for the main invoice in the request (includes its details)
interface InvoiceInput {
  date: string; // Or Date if you prefer to handle it as a Date object in the frontend and convert it
  description: string;
  is_payed?: boolean; // Optional, with default value in DB
  upload_file?: string | null; // Optional, can be null
  details: InvoiceDetailInput[]; // Array of invoice details
}

interface UpdatePaymentStatusBody {
  is_payed: boolean;
}

// --- Controller Functions ---

// 1. Create a new Invoice with its Details
export const createInvoiceWithDetails = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { date, description, is_payed, upload_file, details }: InvoiceInput = req.body;

    // Validate basic input data for the header
    if (!date || !description || !details || details.length === 0) {
      return res.status(400).json({ error: 'Date, description, and at least one invoice detail are mandatory.' });
    }

    // Validate that all details have the required fields
    for (const detail of details) {
      if (!detail.demande || !detail.name_patient || !detail.date_prel || !detail.ref_patient || detail.montant === undefined || detail.montant === null) {
        return res.status(400).json({ error: 'All required fields in invoice details (demande, name_patient, date_prel, ref_patient, montant) are mandatory.' });
      }
    }

    // Insert the invoice header
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoice')
      .insert({
        date,
        description,
        is_payed: is_payed ?? false, // Use the provided value or the database default
        upload_file: upload_file ?? null, // Use the provided value or null
        // created_at, updated_at, is_active are handled by default in the table
      })
      .select('invoice_id'); // We only need the invoice_id for the details

    if (invoiceError || !invoiceData || invoiceData.length === 0) {
      console.error('Error creating invoice:', invoiceError);
      return res.status(500).json({ error: 'Error creating the main invoice.' });
    }

    const invoice_id = invoiceData[0].invoice_id;

    // Prepare the details for insertion
    const detailsToInsert = details.map(detail => ({
      ...detail,
      invoice_id: invoice_id, // Assign the newly created invoice ID
      // created_at, updated_at, is_active are handled by default in the table
    }));

    // Insert the invoice details
    const { data: detailData, error: detailError } = await supabase
      .from('invoicedetail')
      .insert(detailsToInsert)
      .select(); // Select all fields of the inserted details

    if (detailError) {
      console.error('Error creating invoice details:', detailError);
      // If details fail, we revert the creation of the main invoice.
      await supabase.from('invoice').delete().eq('invoice_id', invoice_id);
      return res.status(500).json({ error: 'Error creating invoice details. The main invoice was reverted.' });
    }

    res.status(201).json({
      message: 'Invoice and details created successfully.',
      invoice: invoiceData[0],
      details: detailData,
    });

  } catch (err: any) {
    console.error('Exception in createInvoiceWithDetails:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 2. Get all Invoices (headers only)
export const getAllInvoices = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('invoice')
      .select('*')
      .eq('is_active', true) // Only active invoices
      .order('created_at', { ascending: false }); // Order by creation date

    if (error) {
      console.error('Error getting invoices:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Exception in getAllInvoices:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 3. Get Details of a Specific Invoice by invoice_id
export const getInvoiceDetailsById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params; // invoiceId comes from the URL (e.g. /invoices/123/details)

    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is mandatory.' });
    }

    const { data, error } = await supabase
      .from('invoicedetail')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('is_active', true) // Only active details
      .order('created_at', { ascending: true }); // Order by creation date

    if (error) {
      console.error('Error getting invoice details:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No details found for the specified invoice.' });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Exception in getInvoiceDetailsById:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 4. "Delete" an Invoice and its Associated Details (Soft Delete)
export const deleteInvoice = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is mandatory for deletion.' });
    }

    // First, update is_active to false for the invoice details
    const { error: updateDetailsError } = await supabase
      .from('invoicedetail')
      .update({ is_active: false, updated_at: new Date().toISOString() }) // Also update updated_at
      .eq('invoice_id', invoiceId);

    if (updateDetailsError) {
      console.error('Error updating invoice details to inactive:', updateDetailsError);
      return res.status(500).json({ error: 'Error updating invoice details.' });
    }

    // Then, update is_active to false for the main invoice
    const { error: updateInvoiceError } = await supabase
      .from('invoice')
      .update({ is_active: false, updated_at: new Date().toISOString() }) // Also update updated_at
      .eq('invoice_id', invoiceId);

    if (updateInvoiceError) {
      console.error('Error updating main invoice to inactive:', updateInvoiceError);
      return res.status(500).json({ error: 'Error updating the main invoice.' });
    }

    res.status(200).json({ message: 'Invoice and its details successfully marked as inactive.' });

  } catch (err: any) {
    console.error('Exception in deleteInvoice:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 5. Update the 'is_payed' status of an invoice
export const updateInvoicePaymentStatus = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { is_payed }: UpdatePaymentStatusBody = req.body;

    // Validate that invoiceId is provided
    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is mandatory to update payment status.' });
    }

    // Validate that is_payed is a boolean
    if (typeof is_payed !== 'boolean') {
      return res.status(400).json({ error: 'The value for "is_payed" must be a boolean (true/false).' });
    }

    // Update the is_payed field and updated_at
    const { data, error } = await supabase
      .from('invoice')
      .update({ is_payed: is_payed, updated_at: new Date().toISOString() })
      .eq('invoice_id', invoiceId)
      .select(); // To get the updated invoice

    if (error) {
      console.error('Error updating invoice payment status:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Invoice not found or could not be updated.' });
    }

    res.status(200).json({
      message: 'Invoice payment status updated successfully.',
      invoice: data[0],
    });

  } catch (err: any) {
    console.error('Exception in updateInvoicePaymentStatus:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
