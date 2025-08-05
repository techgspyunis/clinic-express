import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

// Define interfaces for better typing
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

interface PatientData {
  correlativePatient: number;
  patientRef: string;
  analyzeRef: string;
  code: string;
}

/**
 * Function that creates an order preview from a 3-column input format.
 * It generates the missing fields (number, references, code) and saves them in preview tables.
 */
export const createOrderPreview = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { date, description, year, month, week, orderDetails }: OrderPreviewRequestBody = req.body;

    // 1. Input validation
    if (!orderDetails || orderDetails.length === 0) {
      return res.status(400).json({ error: 'The order details list is empty.' });
    }

    // 2. Validation for an existing preview for the same period
    const { data: existingPreview, error: existingError } = await supabase
      .from('orderpreview')
      .select('order_id')
      .eq('yearNumber', year)
      .eq('monthNumber', month)
      .eq('weekNumber', week)
      .limit(1);

    if (existingError) {
      console.error('Error searching for existing preview:', existingError);
      return res.status(500).json({ error: 'Error validating the existing preview.' });
    }

    if (existingPreview && existingPreview.length > 0) {
      return res.status(409).json({ error: `An order preview for year ${year}, month ${month}, and week ${week} already exists.` });
    }

    // 3. Insert the main order preview
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
      console.error('Error inserting the order preview:', orderPreviewError);
      return res.status(500).json({ error: 'Error creating the order preview.' });
    }

    const orderId = orderPreviewData[0].order_id;

    // Get a unique list of medical centers to find the last correlative number
    const uniqueMedicalCenters = [...new Set(orderDetails.map(detail => detail.medical_center))];
    
    // Object to keep track of correlative numbers by medical center
    const medicalCenterCorrelatives: { [key: string]: number } = {};

    // 4. Find the last correlative number from the previous week for each medical center
    for (const mc of uniqueMedicalCenters) {
      let lastCorrelative = 0;
      if (week > 1) {
        // The week is greater than 1, we look for the last order from the previous week.
        const { data: previousOrderPreviewData, error: prevOrderPreviewError } = await supabase
          .from('orderpreview')
          .select('order_id')
          .eq('yearNumber', year)
          .eq('monthNumber', month)
          .eq('weekNumber', week - 1)
          .limit(1)
          .single();

        if (prevOrderPreviewError || !previousOrderPreviewData) {
          console.error(`Error or no order preview found for week ${week - 1}. The correlative number will be reset.`);
        } else {
          const previousOrderId = previousOrderPreviewData.order_id;
          
          const { data: lastOrderData, error: lastOrderError } = await supabase
            .from('orderdetailpreview')
            .select('ref_patient')
            .eq('centre_medical', mc)
            .eq('order_id', previousOrderId)
            .order('number', { ascending: false })
            .limit(1);

          if (lastOrderError) {
            console.error(`Error searching for the last correlative for medical center ${mc}:`, lastOrderError);
          }
          
          if (lastOrderData && lastOrderData.length > 0) {
            const lastRefPatient = lastOrderData[0].ref_patient;
            const correlativeString = lastRefPatient.slice(-3);
            lastCorrelative = parseInt(correlativeString, 10);
          }
        }
      }
      medicalCenterCorrelatives[mc] = lastCorrelative;
    }

    const processedDetails = [];
    const patientDataMap: { [key: string]: PatientData } = {};

    // 5. Process each order detail from the input, ensuring one correlative per patient
    for (const detail of orderDetails) {
      let currentPatientData = patientDataMap[detail.patient_name];

      // If the patient has not been processed in this preview, we generate new correlatives.
      if (!currentPatientData) {
        // a. Get the medical center abbreviation
        const { data: medicalCenterData, error: mcError } = await supabase
          .from('centremedical')
          .select('abbreviation')
          .eq('name', detail.medical_center)
          .single();

        if (mcError || !medicalCenterData) {
          console.error(`Medical center not found: ${detail.medical_center}`, mcError);
          continue;
        }
        const abbreviation = (medicalCenterData as MedicalCenterAbbr).abbreviation;

        // b. Generate the correlative numbers from the last value
        medicalCenterCorrelatives[detail.medical_center]++;
        const correlativePatient = medicalCenterCorrelatives[detail.medical_center];

        // c. Format the fields
        const monthYear = `${String(month).padStart(2, '0')}${String(year).slice(-2)}`;
        const formattedCorrelative = String(correlativePatient).padStart(3, '0');

        const patientRef = `${abbreviation}HWF${monthYear}${formattedCorrelative}`;
        
        // d. Get the code from the nomenclature
        const { data: translationData, error: translationError } = await supabase
          .from('translation')
          .select('code_hw')
          .eq('name', detail.nomenclature)
          .limit(1);

        if (translationError || !translationData || translationData.length === 0) {
          console.error(`Code not found for nomenclature: ${detail.nomenclature}`, translationError);
          continue;
        }
        const code = (translationData[0] as TranslationCode).code_hw;

        // e. Generate the correlative and analysis reference
        const analyzeRef = `${code}F${monthYear}${formattedCorrelative}`;

        currentPatientData = {
          correlativePatient,
          patientRef,
          analyzeRef,
          code,
        };
        // Save the patient data for reuse
        patientDataMap[detail.patient_name] = currentPatientData;
      }
      
      // f. Build the preview detail object
      processedDetails.push({
        order_id: orderId,
        "number": currentPatientData.correlativePatient,
        centre_medical: detail.medical_center,
        ref_patient: currentPatientData.patientRef,
        name_patient: detail.patient_name,
        ref_analyze: currentPatientData.analyzeRef,
        nomenclature_examen: detail.nomenclature,
        code: currentPatientData.code,
      });
    }

    // 6. Insert the order preview details
    const { data: detailData, error: detailError } = await supabase
      .from('orderdetailpreview')
      .insert(processedDetails)
      .select('*');

    if (detailError) {
      console.error('Error inserting the preview details:', detailError);
      return res.status(500).json({ error: 'Error saving the order details.' });
    }

    res.status(201).json({
      message: 'Order preview created successfully.',
      orderId,
      orderDetails: detailData,
    });

  } catch (err: any) {
    console.error('Exception in createOrderPreview:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Function to get all order previews (only headers),
 * filtered by year, month, and week.
 */
export const getAllOrderPreviews = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    // Parameters are obtained from the query string (e.g., ?year=2024&month=4&week=2)
    const { year, month, week } = req.query;

    // Input parameter validation
    if (!year || !month || !week) {
      return res.status(400).json({ error: 'The parameters year, month, and week are mandatory.' });
    }

    // Convert parameters to integers
    const yearNumber = parseInt(year as string, 10);
    const monthNumber = parseInt(month as string, 10);
    const weekNumber = parseInt(week as string, 10);

    // Query the 'orderpreview' table
    const { data: orderPreviews, error } = await supabase
      .from('orderpreview')
      .select('*') // We only get the order header
      .eq('yearNumber', yearNumber)
      .eq('monthNumber', monthNumber)
      .eq('weekNumber', weekNumber)
      .order('created_at', { ascending: false }); // Optional: sort by creation date

    if (error) {
      console.error('Error fetching order previews:', error);
      return res.status(500).json({ error: 'Error fetching the order previews.' });
    }
    
    // If there's no data, we return an empty array and a message
    if (!orderPreviews || orderPreviews.length === 0) {
      return res.status(404).json({ message: 'No order previews were found for the specified week.', data: [] });
    }

    res.status(200).json(orderPreviews);

  } catch (err: any) {
    console.error('Exception in getAllOrderPreviews:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Function to get the details of a specific order preview
 * from its order_id.
 */
export const getOrderDetailPreviews = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is mandatory.' });
    }
    
    const { data: details, error } = await supabase
      .from('orderdetailpreview')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching preview details:', error);
      return res.status(500).json({ error: 'Error fetching the preview details.' });
    }

    if (!details || details.length === 0) {
      return res.status(404).json({ message: 'No details were found for the specified order preview.', data: [] });
    }

    res.status(200).json(details);

  } catch (err: any) {
    console.error('Exception in getOrderDetailPreviews:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


/**
 * Function that confirms an order preview and moves it to the final tables.
 */
export const confirmOrderPreview = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required.' });
    }

    // 1. Get preview data
    const { data: previewData, error: previewError } = await supabase
      .from('orderpreview')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (previewError || !previewData) {
      console.error('Order preview not found or error:', previewError);
      return res.status(404).json({ error: 'Order preview not found.' });
    }

    const { data: detailPreviewData, error: detailPreviewError } = await supabase
      .from('orderdetailpreview')
      .select('*')
      .eq('order_id', orderId);

    if (detailPreviewError || !detailPreviewData || detailPreviewData.length === 0) {
      console.error('Order preview details not found or error:', detailPreviewError);
      return res.status(404).json({ error: 'Order preview details not found.' });
    }

    // 2. Insert data into the final 'order' and 'orderdetail' tables
    // We assume the final tables have a compatible structure.
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
      console.error('Error inserting final order:', finalOrderError);
      return res.status(500).json({ error: 'Error confirming the order.' });
    }

    const finalOrderId = finalOrderData[0].order_id;
    
    // Map the detail data for the final insertion
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
      console.error('Error inserting final order details:', finalDetailsError);
      return res.status(500).json({ error: 'Error confirming the order details.' });
    }

    // 3. Delete the preview data
    const { error: deleteDetailsError } = await supabase
      .from('orderdetailpreview')
      .delete()
      .eq('order_id', orderId);

    if (deleteDetailsError) {
      console.error('Error deleting preview details:', deleteDetailsError);
    }

    const { error: deleteOrderError } = await supabase
      .from('orderpreview')
      .delete()
      .eq('order_id', orderId);

    if (deleteOrderError) {
      console.error('Error deleting order preview:', deleteOrderError);
    }

    res.status(200).json({
      message: 'Order confirmed and saved successfully.',
      orderId: finalOrderId,
    });

  } catch (err: any) {
    console.error('Exception in confirmOrderPreview:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


export const deactivateOrderPreview = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is mandatory.' });
    }

    // Check if the order exists and is not already inactive
    const { data: existingOrder, error: fetchError } = await supabase
      .from('orderpreview')
      .select('is_active')
      .eq('order_id', orderId)
      .single();

    if (fetchError || !existingOrder) {
      console.error('Order preview not found or error fetching:', fetchError);
      return res.status(404).json({ error: 'Order preview not found.' });
    }

    if (!existingOrder.is_active) {
      return res.status(409).json({ message: 'Order preview is already inactive.' });
    }

    // Update details the is_active status to false
    const { error: updateDetailError } = await supabase
      .from('orderdetailpreview')
      .update({ is_active: false })
      .eq('order_id', orderId)
      .select();


    // Update the is_active status to false
    const { data, error: updateError } = await supabase
      .from('orderpreview')
      .update({ is_active: false })
      .eq('order_id', orderId)
      .select();

    if (updateError) {
      console.error('Error deactivating order preview:', updateError);
      return res.status(500).json({ error: 'Error deactivating the order preview.' });
    }



    res.status(200).json({ message: 'Order preview deactivated successfully.', data });

  } catch (err: any) {
    console.error('Exception in deactivateOrderPreview:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
