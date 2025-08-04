import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// Definimos las interfaces para una mejor tipificación
interface OrderDetailInput {
  medical_center: string;
  patient_name: string;
  nomenclature: string;
}

interface OrderPreviewRequestBody {
  date: string;
  description: string;
  year: number;
  month: number;
  week: number;
  orderDetails: OrderDetailInput[];
}

interface MedicalCenterAbbr {
  abbreviation: string;
}

interface TranslationCode {
  code_hw: string;
}

/**
 * Función que crea un preview de órdenes a partir de un formato de entrada de 3 columnas.
 * Genera los campos faltantes (número, referencias, código) y los guarda en tablas de previsualización.
 */
export const createOrderPreview = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { date, description, year, month, week, orderDetails }: OrderPreviewRequestBody = req.body;

    // 1. Validación de la entrada
    if (!orderDetails || orderDetails.length === 0) {
      return res.status(400).json({ error: 'La lista de detalles de la orden está vacía.' });
    }


    // 2. Validación de previsualización existente para el mismo periodo
    const { data: existingPreview, error: existingError } = await supabase
      .from('orderpreview')
      .select('order_id')
      .eq('yearNumber', year)
      .eq('monthNumber', month)
      .eq('weekNumber', week)
      .limit(1);

    if (existingError) {
      console.error('Error al buscar previsualización existente:', existingError);
      return res.status(500).json({ error: 'Error al verificar la previsualización existente.' });
    }

    if (existingPreview && existingPreview.length > 0) {
      return res.status(409).json({ error: `Ya existe una previsualización de orden para el año ${year}, mes ${month} y semana ${week}.` });
    }

    // 3. Insertamos la orden principal de previsualización
    const { data: orderPreviewData, error: orderPreviewError } = await supabase
      .from('orderpreview')
      .insert({
        date,
        description,
        "yearNumber": year,
        "monthNumber": month,
        "weekNumber": week,
      })
      .select('order_id');

    if (orderPreviewError) {
      console.error('Error al insertar la orden de previsualización:', orderPreviewError);
      return res.status(500).json({ error: 'Error al crear la previsualización de la orden.' });
    }

    const orderId = orderPreviewData[0].order_id;

    // Obtener una lista única de centros médicos para buscar el último correlativo
    const uniqueMedicalCenters = [...new Set(orderDetails.map(detail => detail.medical_center))];
    
    // Objeto para llevar el control de los correlativos por centro médico
    const medicalCenterCorrelatives: { [key: string]: number } = {};

    // 4. Buscar el último correlativo de la semana anterior para cada centro médico
    for (const mc of uniqueMedicalCenters) {
      let lastCorrelative = 0;
      if (week > 1) {
        // La semana es mayor que 1, buscamos la última orden de la semana anterior.
        // Primero, encontrar la orden padre (orderpreview) de la semana anterior,
        // filtrando por año, mes y semana para mayor precisión.
        const { data: previousOrderPreviewData, error: prevOrderPreviewError } = await supabase
          .from('orderpreview')
          .select('order_id')
          .eq('yearNumber', year)
          .eq('monthNumber', month)
          .eq('weekNumber', week - 1)
          .limit(1)
          .single();

        if (prevOrderPreviewError || !previousOrderPreviewData) {
          console.error(`Error o no se encontró el preview de orden para la semana ${week - 1}. El correlativo se reiniciará.`);
          // Si no hay preview de orden para la semana anterior, el correlativo empieza en 0.
        } else {
          const previousOrderId = previousOrderPreviewData.order_id;
          
          // Luego, buscar el último ref_patient de ese order_id para el centro médico actual.
          const { data: lastOrderData, error: lastOrderError } = await supabase
            .from('orderdetailpreview')
            .select('ref_patient')
            .eq('centre_medical', mc)
            .eq('order_id', previousOrderId)
            .order('number', { ascending: false }) // Ordenamos por el campo numérico 'number' para asegurar la secuencia
            .limit(1);

          if (lastOrderError) {
            console.error(`Error al buscar el último correlativo para el centro ${mc}:`, lastOrderError);
            // El correlativo se mantiene en 0.
          }
          
          if (lastOrderData && lastOrderData.length > 0) {
            const lastRefPatient = lastOrderData[0].ref_patient;
            // Extraemos los últimos 3 dígitos del string y los convertimos a número
            const correlativeString = lastRefPatient.slice(-3);
            lastCorrelative = parseInt(correlativeString, 10);
          }
        }
      }
      medicalCenterCorrelatives[mc] = lastCorrelative;
    }

    const processedDetails = [];

    // 4. Procesamos cada detalle de la orden de entrada
    for (const detail of orderDetails) {
      // a. Obtener la abreviatura del centro médico
      const { data: medicalCenterData, error: mcError } = await supabase
        .from('centremedical')
        .select('abbreviation')
        .eq('name', detail.medical_center)
        .single();

      if (mcError || !medicalCenterData) {
        console.error(`Centro médico no encontrado: ${detail.medical_center}`, mcError);
        continue;
      }
      const abbreviation = (medicalCenterData as MedicalCenterAbbr).abbreviation;

      // b. Obtener el código a partir de la nomenclatura
      const { data: translationData, error: translationError } = await supabase
        .from('translation')
        .select('code_hw')
        .eq('name', detail.nomenclature)
        .limit(1);

      if (translationError || !translationData || translationData.length === 0) {
        console.error(`Código no encontrado para la nomenclatura: ${detail.nomenclature}`, translationError);
        continue;
      }
      const code = (translationData[0] as TranslationCode).code_hw;

      // c. Generar los números correlativos a partir del último valor
      medicalCenterCorrelatives[detail.medical_center]++;
      const correlativePatient = medicalCenterCorrelatives[detail.medical_center];
      const correlativeAnalyze = correlativePatient;

      // d. Formatear los campos
      const monthYear = `${String(month).padStart(2, '0')}${String(year).slice(-2)}`;
      const formattedCorrelative = String(correlativePatient).padStart(3, '0');

      const patientRef = `${abbreviation}HWF${monthYear}${formattedCorrelative}`;
      const analyzeRef = `${code}F${monthYear}${String(correlativeAnalyze).padStart(3, '0')}`;

      // e. Construir el objeto de detalle de previsualización
      processedDetails.push({
        order_id: orderId,
        "number": correlativePatient,
        centre_medical: detail.medical_center,
        ref_patient: patientRef,
        name_patient: detail.patient_name,
        ref_analyze: analyzeRef,
        nomenclature_examen: detail.nomenclature,
        code: code,
      });
    }

    // 5. Insertamos los detalles de la orden de previsualización
    const { data: detailData, error: detailError } = await supabase
      .from('orderdetailpreview')
      .insert(processedDetails)
      .select('*');

    if (detailError) {
      console.error('Error al insertar los detalles de previsualización:', detailError);
      return res.status(500).json({ error: 'Error al guardar los detalles de la orden.' });
    }

    res.status(201).json({
      message: 'Previsualización de órdenes creada exitosamente.',
      orderId,
      orderDetails: detailData,
    });

  } catch (err: any) {
    console.error('Excepción en createOrderPreview:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};


export const getAllOrderPreviews = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    // Los parámetros se obtienen de la query string (ej. ?year=2024&month=4&week=2)
    const { year, month, week } = req.query;

    // Validación de parámetros de entrada
    if (!year || !month || !week) {
      return res.status(400).json({ error: 'Los parámetros year, month y week son obligatorios.' });
    }

    // Convertir los parámetros a números enteros
    const yearNumber = parseInt(year as string, 10);
    const monthNumber = parseInt(month as string, 10);
    const weekNumber = parseInt(week as string, 10);

    // Consulta a la tabla 'orderpreview'
    const { data: orderPreviews, error } = await supabase
      .from('orderpreview')
      .select('*') // Solo obtenemos la cabecera de la orden
      .eq('yearNumber', yearNumber)
      .eq('monthNumber', monthNumber)
      .eq('weekNumber', weekNumber)
      .order('created_at', { ascending: false }); // Opcional: ordenar por fecha de creación

    if (error) {
      console.error('Error al obtener previsualizaciones de órdenes:', error);
      return res.status(500).json({ error: 'Error al obtener las previsualizaciones de órdenes.' });
    }
    
    // Si no hay datos, devolvemos un array vacío y un mensaje
    if (!orderPreviews || orderPreviews.length === 0) {
      return res.status(404).json({ message: 'No se encontraron previsualizaciones de órdenes para la semana especificada.', data: [] });
    }

    res.status(200).json(orderPreviews);

  } catch (err: any) {
    console.error('Excepción en getAllOrderPreviews:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

/**
 * Función para obtener los detalles de una previsualización de orden específica
 * a partir de su order_id.
 */
export const getOrderDetailPreviews = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'ID de orden es obligatorio.' });
    }
    
    const { data: details, error } = await supabase
      .from('orderdetailpreview')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error al obtener los detalles de la previsualización:', error);
      return res.status(500).json({ error: 'Error al obtener los detalles de la previsualización.' });
    }

    if (!details || details.length === 0) {
      return res.status(404).json({ message: 'No se encontraron detalles para la previsualización de orden especificada.', data: [] });
    }

    res.status(200).json(details);

  } catch (err: any) {
    console.error('Excepción en getOrderDetailPreviews:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};


/**
 * Función que confirma una orden de previsualización y la mueve a las tablas finales.
 */
export const confirmOrderPreview = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'El ID de la orden es requerido.' });
    }

    // 1. Obtener los datos de previsualización
    const { data: previewData, error: previewError } = await supabase
      .from('orderpreview')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (previewError || !previewData) {
      console.error('Previsualización de orden no encontrada o error:', previewError);
      return res.status(404).json({ error: 'Previsualización de orden no encontrada.' });
    }

    const { data: detailPreviewData, error: detailPreviewError } = await supabase
      .from('orderdetailpreview')
      .select('*')
      .eq('order_id', orderId);

    if (detailPreviewError || !detailPreviewData || detailPreviewData.length === 0) {
      console.error('Detalles de previsualización de orden no encontrados o error:', detailPreviewError);
      return res.status(404).json({ error: 'Detalles de previsualización de orden no encontrados.' });
    }

    // 2. Insertar los datos en las tablas definitivas 'order' y 'orderdetail'
    // Asumimos que las tablas finales tienen una estructura compatible.
    const { data: finalOrderData, error: finalOrderError } = await supabase
      .from('order')
      .insert({
        date: previewData.date,
        description: previewData.description,
        "yearNumber": previewData.yearNumber,
        "monthNumber": previewData.monthNumber,
        "weekNumber": previewData.weekNumber,
      })
      .select('order_id');

    if (finalOrderError) {
      console.error('Error al insertar la orden final:', finalOrderError);
      return res.status(500).json({ error: 'Error al confirmar la orden.' });
    }

    const finalOrderId = finalOrderData[0].order_id;
    
    // Mapeamos los datos de los detalles para la inserción final
    const finalDetailData = detailPreviewData.map(detail => ({
      order_id: finalOrderId,
      "number": detail.number,
      centre_medical: detail.centre_medical,
      ref_patient: detail.ref_patient,
      name_patient: detail.name_patient,
      ref_analyze: detail.ref_analyze,
      nomenclature_examen: detail.nomenclature_examen,
      code: detail.code,
    }));

    const { data: finalDetailsData, error: finalDetailsError } = await supabase
      .from('orderdetail')
      .insert(finalDetailData);

    if (finalDetailsError) {
      console.error('Error al insertar los detalles de la orden final:', finalDetailsError);
      return res.status(500).json({ error: 'Error al confirmar los detalles de la orden.' });
    }

    // 3. Eliminar los datos de previsualización
    const { error: deleteDetailsError } = await supabase
      .from('orderdetailpreview')
      .delete()
      .eq('order_id', orderId);

    if (deleteDetailsError) {
      console.error('Error al eliminar los detalles de previsualización:', deleteDetailsError);
      // No devolvemos un error 500, ya que la orden principal ya se insertó.
      // Simplemente lo registramos para limpieza futura.
    }

    const { error: deleteOrderError } = await supabase
      .from('orderpreview')
      .delete()
      .eq('order_id', orderId);

    if (deleteOrderError) {
      console.error('Error al eliminar la orden de previsualización:', deleteOrderError);
    }

    res.status(200).json({
      message: 'Orden confirmada y guardada exitosamente.',
      orderId: finalOrderId,
    });

  } catch (err: any) {
    console.error('Excepción en confirmOrderPreview:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
