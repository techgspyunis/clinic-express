import express from 'express';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Importamos SupabaseClient para tipado
import { registerUser, loginUser } from './controllers/authController'; // Importamos los controladores
import { authenticateToken } from './middlewares/authMiddleware'; // Importamos el middleware de autenticación
import cors from 'cors';
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
} from './controllers/administrativeController';

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


// 7. Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor Express escuchando en http://localhost:${PORT}`);
  console.log(`Conectado a Supabase: ${SUPABASE_URL}`);
});
