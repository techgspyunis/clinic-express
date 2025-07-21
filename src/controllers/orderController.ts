import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// --- Interfaces para la estructura de datos ---

// Interfaz para un detalle de orden en la petición
interface OrderDetailInput {
  number: number;
  centre_medical: string;
  ref_patient: string;
  name_patient: string;
  ref_analyze: string;
  nomenclature_examen: string;
  code: string;
}

// Interfaz para la orden principal en la petición (incluye sus detalles)
interface OrderInput {
  date: string; // O Date si prefieres manejarlo como objeto Date en el frontend y convertirlo
  description: string;
  upload_file: string;
  details: OrderDetailInput[]; // Array de los detalles de la orden
}

// --- Funciones del Controlador ---

// 1. Crear una nueva Orden con sus Detalles
export const createOrderWithDetails = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { date, description, upload_file, details }: OrderInput = req.body;

    // Validar datos de entrada básicos
    if (!date || !description || !details || details.length === 0) {
      return res.status(400).json({ error: 'La fecha, descripción y al menos un detalle son obligatorios.' });
    }

    // Validar que todos los detalles tengan los campos requeridos
    for (const detail of details) {
      if (!detail.number || !detail.centre_medical || !detail.ref_patient || !detail.name_patient || !detail.ref_analyze || !detail.nomenclature_examen || !detail.code) {
        return res.status(400).json({ error: 'Todos los campos en los detalles de la orden son obligatorios.' });
      }
    }

    // Insertar la cabecera de la orden
    const { data: orderData, error: orderError } = await supabase
      .from('order')
      .insert({
        date,
        description,
        upload_file
        // created_at, updated_at, is_active se manejan por defecto en la tabla
      })
      .select('order_id'); // Solo necesitamos el order_id para los detalles

    if (orderError || !orderData || orderData.length === 0) {
      console.error('Error al crear la orden:', orderError);
      return res.status(500).json({ error: 'Error al crear la orden principal.' });
    }

    const order_id = orderData[0].order_id;

    // Preparar los detalles para la inserción
    const detailsToInsert = details.map(detail => ({
      ...detail,
      order_id: order_id, // Asignar el ID de la orden recién creada
      created_at: new Date().toISOString(), // Asegurar que created_at se genera si no es por defecto en DB
      updated_at: new Date().toISOString(), // Asegurar que updated_at se genera si no es por defecto en DB
    }));

    // Insertar los detalles de la orden
    const { data: detailData, error: detailError } = await supabase
      .from('orderdetail')
      .insert(detailsToInsert)
      .select(); // Seleccionar todos los campos de los detalles insertados

    if (detailError) {
      console.error('Error al crear los detalles de la orden:', detailError);
      // Si los detalles fallan, podríamos querer revertir la creación de la orden principal.
      // Supabase no tiene transacciones directas para múltiples tablas en el cliente JS.
      // Para una "no sobreingeniería", por ahora, solo reportamos el error.
      // En un caso más robusto, se podría añadir una lógica para eliminar la orden principal aquí.
      await supabase.from('order').delete().eq('order_id', order_id); // Intentar revertir la orden principal
      return res.status(500).json({ error: 'Error al crear los detalles de la orden. La orden principal fue revertida.' });
    }

    res.status(201).json({
      message: 'Orden y detalles creados exitosamente.',
      order: orderData[0],
      details: detailData,
    });

  } catch (err: any) {
    console.error('Excepción en createOrderWithDetails:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 2. Obtener todas las Órdenes (solo cabeceras)
export const getAllOrders = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('order')
      .select('*')
      .eq('is_active', true) // Opcional: solo órdenes activas
      .order('created_at', { ascending: false }); // Ordenar por fecha de creación

    if (error) {
      console.error('Error al obtener órdenes:', error);
      return res.status(500).json({ error: error.message });
    }

        if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No se encontraron ordenes' });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Excepción en getAllOrders:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 3. Obtener Detalles de una Orden Específica por order_id
export const getOrderDetailsById = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params; // orderId viene de la URL (ej. /orders/123/details)

    if (!orderId) {
      return res.status(400).json({ error: 'ID de orden es obligatorio.' });
    }

    const { data, error } = await supabase
      .from('orderdetail')
      .select('*')
      .eq('order_id', orderId)
      .eq('is_active', true) // Opcional: solo detalles activos
      .order('number', { ascending: true }); // Opcional: ordenar detalles por número

    if (error) {
      console.error('Error al obtener detalles de la orden:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No se encontraron detalles para la orden especificada.' });
    }

    res.status(200).json(data);
  } catch (err: any) {
    console.error('Excepción en getOrderDetailsById:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 4. "Eliminar" una Orden y sus Detalles Asociados (Soft Delete)
export const deleteOrder = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'ID de orden es obligatorio para la eliminación.' });
    }

    // Primero, actualizar is_active a false para los detalles de la orden
    const { error: updateDetailsError } = await supabase
      .from('orderdetail')
      .update({ is_active: false })
      .eq('order_id', orderId);

    if (updateDetailsError) {
      console.error('Error al actualizar detalles de la orden a inactivos:', updateDetailsError);
      return res.status(500).json({ error: 'Error al actualizar los detalles de la orden.' });
    }

    // Luego, actualizar is_active a false para la orden principal
    const { error: updateOrderError } = await supabase
      .from('order')
      .update({ is_active: false })
      .eq('order_id', orderId);

    if (updateOrderError) {
      console.error('Error al actualizar la orden principal a inactiva:', updateOrderError);
      return res.status(500).json({ error: 'Error al actualizar la orden principal.' });
    }

    res.status(200).json({ message: 'Orden y sus detalles marcados como inactivos exitosamente.' });

  } catch (err: any) {
    console.error('Excepción en deleteOrder:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
