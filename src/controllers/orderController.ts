import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// --- Interfaces for data structure ---

// Interface for an order detail in the request
interface OrderDetailInput {
  number: number;
  centre_medical: string;
  ref_patient: string;
  name_patient: string;
  ref_analyze: string;
  nomenclature_examen: string;
  code: string;
}

// Interface for the main order in the request (includes its details)
interface OrderInput {
  date: string; // Or Date if you prefer to handle it as a Date object in the frontend and convert it
  description: string;
  upload_file: string;
  details: OrderDetailInput[]; // Array of order details
}

// --- Controller Functions ---

// 1. Create a new Order with its Details
export const createOrderWithDetails = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { date, description, upload_file, details }: OrderInput = req.body;

    // Validate basic input data
    if (!date || !description || !details || details.length === 0) {
      return res.status(400).json({ error: 'Date, description, and at least one detail are mandatory.' });
    }

    // Validate that all details have the required fields
    for (const detail of details) {
      if (!detail.number || !detail.centre_medical || !detail.ref_patient || !detail.name_patient || !detail.ref_analyze || !detail.nomenclature_examen || !detail.code) {
        return res.status(400).json({ error: 'All fields in order details are mandatory.' });
      }
    }

    // Insert the order header
    const { data: orderData, error: orderError } = await supabase
      .from('order')
      .insert({
        date,
        description,
        upload_file
        // created_at, updated_at, is_active are handled by default in the table
      })
      .select('order_id'); // We only need the order_id for the details

    if (orderError || !orderData || orderData.length === 0) {
      console.error('Error creating order:', orderError);
      return res.status(500).json({ error: 'Error creating the main order.' });
    }

    const order_id = orderData[0].order_id;

    // Prepare the details for insertion
    const detailsToInsert = details.map(detail => ({
      ...detail,
      order_id: order_id, // Assign the newly created order ID
      created_at: new Date().toISOString(), // Ensure created_at is generated if not default in DB
      updated_at: new Date().toISOString(), // Ensure updated_at is generated if not default in DB
    }));

    // Insert the order details
    const { data: detailData, error: detailError } = await supabase
      .from('orderdetail')
      .insert(detailsToInsert)
      .select(); // Select all fields of the inserted details

    if (detailError) {
      console.error('Error creating order details:', detailError);
      // If details fail, we might want to revert the creation of the main order.
      // Supabase does not have direct transactions for multiple tables in the JS client.
      // For "no over-engineering", for now, we just report the error.
      // In a more robust case, logic could be added to delete the main order here.
      await supabase.from('order').delete().eq('order_id', order_id); // Attempt to revert the main order
      return res.status(500).json({ error: 'Error creating order details. The main order was reverted.' });
    }

    res.status(201).json({
      message: 'Order and details created successfully.',
      order: orderData[0],
      details: detailData,
    });

  } catch (err: any) {
    console.error('Exception in createOrderWithDetails:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 2. Get all Orders (headers only)
export const getAllOrders = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('order')
      .select('*')
      .eq('is_active', true) // Optional: only active orders
      .order('created_at', { ascending: false }); // Order by creation date

    if (error) {
      console.error('Error getting orders:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No orders found.' });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Exception in getAllOrders:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 3. Get Details of a Specific Order by order_id
export const getOrderDetailsById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params; // orderId comes from the URL (e.g. /orders/123/details)

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is mandatory.' });
    }

    const { data, error } = await supabase
      .from('orderdetail')
      .select('*')
      .eq('order_id', orderId)
      .eq('is_active', true) // Optional: only active details
      .order('number', { ascending: true }); // Optional: order details by number

    if (error) {
      console.error('Error getting order details:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No details found for the specified order.' });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Exception in getOrderDetailsById:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// 4. "Delete" an Order and its Associated Details (Soft Delete)
export const deleteOrder = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is mandatory for deletion.' });
    }

    // First, update is_active to false for the order details
    const { error: updateDetailsError } = await supabase
      .from('orderdetail')
      .update({ is_active: false })
      .eq('order_id', orderId);

    if (updateDetailsError) {
      console.error('Error updating order details to inactive:', updateDetailsError);
      return res.status(500).json({ error: 'Error updating order details.' });
    }

    // Then, update is_active to false for the main order
    const { error: updateOrderError } = await supabase
      .from('order')
      .update({ is_active: false })
      .eq('order_id', orderId);

    if (updateOrderError) {
      console.error('Error updating main order to inactive:', updateOrderError);
      return res.status(500).json({ error: 'Error updating the main order.' });
    }

    res.status(200).json({ message: 'Order and its details successfully marked as inactive.' });

  } catch (err: any) {
    console.error('Exception in deleteOrder:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
