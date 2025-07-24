// Interfaces para la salida del parser, mapeando a tus tablas administrative y result
interface ParsedAdministrativeData {
  ident_protocol?: string | null;
  lab_identification?: string | null;
  surname?: string | null;
  firstname?: string | null;
  sex?: string | null;
  date_of_birth?: string | null;
  external_identifier?: string | null;
  street_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  prescribing_doctor?: string | null;
  date_request?: string | null;
  empty_field?: string | null; // Campo 'vide' en el documento
  protocol_type?: string | null;
  cover?: string | null;
  holder?: string | null;
  cod_tit1?: string | null;
  cod_tit2?: string | null;
  file_name?: string | null; // Este lo añadiremos nosotros al guardar el archivo
  status?: number | null; // El documento no lo define, pero tu tabla sí
}

interface ParsedResultData {
  type: number; // No está explícitamente en el documento, pero tu tabla sí. Asumiremos 1 para L1, 5 para L5.
  ident_protocol: string;
  analytical_code: string;
  analytical_name: string;
  reference_value: string;
  unit: string;
  code: string;
  result: string;
}

// Estructura de salida del parser para un bloque de paciente
interface ParsedPatientBlock {
  administrative: ParsedAdministrativeData;
  results: ParsedResultData[];
}

/**
 * Parsea el contenido de un archivo .lab en una estructura de datos.
 * Asume que el archivo contiene uno o más bloques de paciente.
 * @param fileContent Contenido del archivo .lab como string.
 * @returns Un array de bloques de paciente parseados.
 */
export const parseLabFile = (fileContent: string): ParsedPatientBlock[] => {
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== ''); // Dividir por líneas y limpiar vacías
  const patientBlocks: ParsedPatientBlock[] = [];
  let currentAdmin: ParsedAdministrativeData = {};
  let currentResults: ParsedResultData[] = [];
  let currentProtocolId: string | null = null; // Para rastrear el ident_protocol del bloque actual

  for (const line of lines) {
    const parts = line.split('\\');
    const recordType = parts[0]; // Ej: A1, A2, L1, L5

    if (!recordType) continue; // Saltar líneas vacías o mal formadas

    // Si encontramos un nuevo A1, significa un nuevo bloque de paciente
    if (recordType.startsWith('A1')) {
      // Si ya tenemos datos en currentAdmin, significa que el bloque anterior terminó
      if (Object.keys(currentAdmin).length > 0 || currentResults.length > 0) {
        patientBlocks.push({ administrative: currentAdmin, results: currentResults });
      }
      // Reiniciar para el nuevo bloque
      currentAdmin = {};
      currentResults = [];
      currentProtocolId = null; // Resetear el ID del protocolo

      // Parsear A1
      currentProtocolId = parts[1];
      currentAdmin.ident_protocol = parts[1];
      currentAdmin.lab_identification = parts[2];
    } else if (currentProtocolId === null) {
      // Si no hemos encontrado un A1 inicial, saltar hasta que lo hagamos
      // Esto maneja el caso de datos corruptos o si el archivo no empieza con A1
      console.warn(`Línea ignorada antes del primer A1: ${line}`);
      continue;
    }

    // Parsear otras partes administrativas
    switch (recordType) {
      case 'A2':
        // A2\<ident.protocole>\<nom>\<prénom>\<sexe>\<date de naissance>\<identifiant externo>
        // Nota: el documento dice <nom> y <prénom>, pero tu tabla tiene surname y firstname
        currentAdmin.surname = parts[2];
        currentAdmin.firstname = parts[3];
        currentAdmin.sex = parts[4];
        currentAdmin.date_of_birth = parts[5]; // ddmmyyyy
        currentAdmin.external_identifier = parts[6] || null;
        break;
      case 'A3':
        // A3\<ident.protocole>\<rue + número>\<code postal>\<localité>\
        currentAdmin.street_number = parts[2];
        currentAdmin.postal_code = parts[3];
        currentAdmin.city = parts[4];
        break;
      case 'A4':
        // A4\<ident.protocole>\<ident.prescripteur>\<date demande>\<vide>\<type de protocole>\
        currentAdmin.prescribing_doctor = parts[2];
        currentAdmin.date_request = parts[3]; // ddmmyyyy
        currentAdmin.empty_field = parts[4] || null; // Campo 'vide'
        currentAdmin.protocol_type = parts[5];
        break;
      case 'A5':
        // A5\<ident.protocole>\<cobertura>\<titular>\<codtit1>\<codtit2>
        // Nota: El documento menciona "N° de la mutuelle" y "N° d’affiliation" antes de cobertura
        // Pero el ejemplo y la estructura solo muestran 4 campos después de ident.protocole.
        // Asumimos que los campos son en orden: cobertura, titular, codtit1, codtit2
        currentAdmin.cover = parts[2];
        currentAdmin.holder = parts[3];
        currentAdmin.cod_tit1 = parts[4];
        currentAdmin.cod_tit2 = parts[5];
        break;
      case 'L1':
        // L1\id.prot.\code anal.\nom anal.\val.réf.\unité\code\résultat\
        currentResults.push({
          type: 1, // Asumimos tipo 1 para L1 (biología clínica)
          ident_protocol: parts[1],
          analytical_code: parts[2],
          analytical_name: parts[3],
          reference_value: parts[4],
          unit: parts[5],
          code: parts[6],
          result: parts[7],
        });
        break;
      case 'L5':
        // L5\id.prot.\code anal.\\\\\résultat\
        currentResults.push({
          type: 5, // Asumimos tipo 5 para L5 (otras especialidades)
          ident_protocol: parts[1],
          analytical_code: parts[2], // code anal.
          analytical_name: '', // No provided in L5 structure
          reference_value: '', // No provided in L5 structure
          unit: '', // No provided in L5 structure
          code: '', // No provided in L5 structure
          result: parts[6], // resultado
        });
        break;
      default:
        console.warn(`Tipo de registro desconocido o no manejado: ${recordType} en línea: ${line}`);
    }
  }

  // Añadir el último bloque de paciente si existe
  if (Object.keys(currentAdmin).length > 0 || currentResults.length > 0) {
    patientBlocks.push({ administrative: currentAdmin, results: currentResults });
  }

  return patientBlocks;
};
