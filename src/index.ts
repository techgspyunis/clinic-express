import express from 'express';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Importamos SupabaseClient para tipado
import { registerUser, loginUser } from './controllers/authController'; // Importamos los controladores
import { authenticateToken } from './middlewares/authMiddleware'; // Importamos el middleware de autenticación
import cors from 'cors';
import multer from 'multer'; // Importamos multer
import {
  createOrderWithDetails,
  getAllOrders,
  getOrderDetailsById,
  deleteOrder,
} from './controllers/orderController'; // Importamos orders

import { // Importamos invoices
  createInvoiceWithDetails,
  getAllInvoices,
  getInvoiceDetailsById,
  deleteInvoice,
  updateInvoicePaymentStatus,
} from './controllers/invoiceController';
import { // Importamos los controladores administrativos
  createAdministrativeWithResults,
  getAllAdministratives,
  getAdministrativeResultsById,
  deleteAdministrative,
  uploadLabFile,
} from './controllers/administrativeController';
import { confirmOrderPreview, createOrderPreview, deactivateOrderPreview, getAllOrderPreviews, getOrderDetailPreviews } from './controllers/orderPreviewController';
import { createMedicalCenter, deactivateMedicalCenter, getAllMedicalCenters, getMedicalCenterById, updateMedicalCenter } from './controllers/centreMedicalController';
import { createTranslationLabo, deactivateTranslationLabo, getAllTranslationLabo, getTranslationLaboById, updateTranslationLabo } from './controllers/translationLaboController';
import { createTranslation, deactivateTranslation, getAllTranslations, getTranslationById, updateTranslation } from './controllers/translationController';
import { createTranslationHw, deactivateTranslationHw, getAllTranslationHw, getTranslationHwById, updateTranslationHw } from './controllers/translationHwController';

// 1. Cargar variables de entorno
dotenv.config();

// 2. Obtener variables de entorno
const PORT = process.env.PORT || 4000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET; // Asegúrate de tener esta variable en .env

// 3. Verificar que las variables críticas estén definidas
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !JWT_SECRET) {
  console.error("Error: SUPABASE_URL, SUPABASE_ANON_KEY y JWT_SECRET deben estar definidas en el archivo .env");
  process.exit(1); // Sale de la aplicación si faltan las variables críticas
}

// 4. Inicializar el cliente de Supabase
// Usamos '!' para afirmar que las variables no son nulas después de la verificación
const supabase: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);

const app = express();

// Configuración básica para permitir todas las solicitudes de cualquier origen.
// Para producción, se recomienda restringir a orígenes específicos.
app.use(cors());

// 5. Middleware para parsear JSON en las peticiones
app.use(express.json());

// Usamos storage en memoria para que el buffer del archivo esté disponible directamente
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Limite de 5MB por archivo (ajusta si es necesario)
  },
});

// 6. Rutas de la API

// Ruta principal
app.get('/', (req, res) => {
  res.send('API de ejemplo con Node.js, Express y Supabase (Autenticación Custom)');
});

// Rutas de autenticación
// Pasamos el cliente de Supabase a las funciones del controlador
app.post('/register', registerUser(supabase));
app.post('/login', loginUser(supabase));

// --- Rutas de ordenes (PROTEGIDAS por JWT) ---
app.post('/orders', authenticateToken, createOrderWithDetails(supabase));
app.get('/orders', authenticateToken, getAllOrders(supabase));
app.get('/orders/:orderId/details', authenticateToken, getOrderDetailsById(supabase));
app.delete('/orders/:orderId', authenticateToken, deleteOrder(supabase));

// --- Rutas de invoices (PROTEGIDAS por JWT) ---
app.post('/invoices', authenticateToken, createInvoiceWithDetails(supabase));
app.get('/invoices', authenticateToken, getAllInvoices(supabase));
app.get('/invoices/:invoiceId/details', authenticateToken, getInvoiceDetailsById(supabase));
app.delete('/invoices/:invoiceId', authenticateToken, deleteInvoice(supabase));
app.patch('/invoices/:invoiceId/payment', authenticateToken, updateInvoicePaymentStatus(supabase));

// --- Rutas Administrativas (PROTEGIDAS por JWT) ---
app.post('/administratives', authenticateToken, createAdministrativeWithResults(supabase));
app.get('/administratives', authenticateToken, getAllAdministratives(supabase));
app.get('/administratives/:administrativeId/results', authenticateToken, getAdministrativeResultsById(supabase));
app.delete('/administratives/:administrativeId', authenticateToken, deleteAdministrative(supabase));
app.post('/upload-lab-file', authenticateToken, upload.single('file'), uploadLabFile(supabase));


// --- NUEVA RUTA: Endpoint para crear una previsualización de órdenes
app.get('/order-previews', authenticateToken, getAllOrderPreviews(supabase));
app.get('/order-previews/:orderId/details', authenticateToken, getOrderDetailPreviews(supabase));
app.post('/order-previews', authenticateToken, createOrderPreview(supabase));
app.delete('/order-previews/:orderId', authenticateToken, deactivateOrderPreview(supabase));
app.post('/orders/confirm/:orderId', authenticateToken, confirmOrderPreview(supabase));


// --- Medical Speciality Routes ---
// Create a new medical speciality
app.post('/centre-medical',authenticateToken, createMedicalCenter(supabase));
// Get all active medical specialities
app.get('/centre-medical',authenticateToken, getAllMedicalCenters(supabase));
// Get a specific medical speciality by ID
app.get('/centre-medical/:centreId',authenticateToken, getMedicalCenterById(supabase));
// Update a medical speciality by ID
app.put('/centre-medical/:centreId',authenticateToken, updateMedicalCenter(supabase));
// Deactivate a medical speciality by ID (soft delete)
app.delete('/centre-medical/:centreId',authenticateToken, deactivateMedicalCenter(supabase));


// --- Translation Labo Routes ---
// Create a new translation laboratory record
app.post('/translationLabos', authenticateToken,createTranslationLabo(supabase));
// Get all active translation laboratory records
app.get('/translationLabos',authenticateToken, getAllTranslationLabo(supabase));
// Get a specific translation laboratory record by ID
app.get('/translationLabos/:laboId',authenticateToken, getTranslationLaboById(supabase));
// Update a translation laboratory record by ID
app.put('/translationLabos/:laboId',authenticateToken, updateTranslationLabo(supabase));
// Deactivate a translation laboratory record by ID (soft delete)
app.delete('/translationLabos/:laboId',authenticateToken, deactivateTranslationLabo(supabase));


// --- Translation Hardware Routes ---
// Create a new translation hardware record
app.post('/translationHw', authenticateToken,createTranslationHw(supabase));
// Get all active translation hardware records
app.get('/translationHw',authenticateToken, getAllTranslationHw(supabase));
// Get a specific translation hardware record by ID
app.get('/translationHw/:hwId',authenticateToken, getTranslationHwById(supabase));
// Update a translation hardware record by ID
app.put('/translationHw/:hwId',authenticateToken, updateTranslationHw(supabase));
// Deactivate a translation hardware record by ID (soft delete)
app.delete('/translationHw/:hwId',authenticateToken, deactivateTranslationHw(supabase));

// --- Translation Routes ---
// Create a new translation record
app.post('/translations', authenticateToken,createTranslation(supabase));
// Get all active translation records
app.get('/translations',authenticateToken, getAllTranslations(supabase));
// Get a specific translation record by ID
app.get('/translations/:translationId', authenticateToken,getTranslationById(supabase));
// Update a translation record by ID
app.put('/translations/:translationId', authenticateToken,updateTranslation(supabase));
// Deactivate a translation record by ID (soft delete)
app.delete('/translations/:translationId',authenticateToken, deactivateTranslation(supabase));


// 7. Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor Express escuchando en http://localhost:${PORT}`);
  console.log(`Conectado a Supabase: ${SUPABASE_URL}`);
});
