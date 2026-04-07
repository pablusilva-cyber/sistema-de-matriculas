/**
 * Serviço para integração com o backend SIAGE
 * Busca dados de alunos no sistema SIAGE
 */

interface StudentData {
  nomeAluno: string;
  cpf: string;
  dataNascimento: string;
  serie: string;
  ano: string;
  nomeMae: string;
  nomePai: string;
  naturalidade: string;
  escola?: string;
  gre?: string;
}

interface ApiResponse {
  success: boolean;
  data?: StudentData;
  error?: string;
}

// URL do backend - usa localhost por padrão
// Para mudar, configure a variável de ambiente VITE_BACKEND_URL
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

/**
 * Busca dados do aluno no SIAGE pelo CPF
 * @param cpf - CPF do aluno (com ou sem formatação)
 * @returns Dados do aluno formatados para o formulário
 */
export const searchStudentByCPF = async (cpf: string): Promise<StudentData> => {
  try {
    // Validar CPF
    if (!cpf || cpf.trim().length === 0) {
      throw new Error('CPF é obrigatório');
    }

    console.log(`🔍 Buscando aluno com CPF: ${cpf}`);

    // Fazer requisição ao backend
    const response = await fetch(`${BACKEND_URL}/api/students/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cpf }),
    });

    // Verificar se a resposta foi bem-sucedida
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const result: ApiResponse = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Aluno não encontrado');
    }

    if (!result.data) {
      throw new Error('Dados do aluno não retornados');
    }

    console.log('✓ Aluno encontrado:', result.data);

    return result.data;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao buscar aluno:', errorMessage);
    throw new Error(`Erro ao buscar aluno: ${errorMessage}`);
  }
};

/**
 * Verifica se o backend está disponível
 * @returns true se o backend está respondendo
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    return response.ok;
  } catch (error) {
    console.warn('Backend não está disponível');
    return false;
  }
};

/**
 * Obtém a lista de rotas disponíveis no backend
 * @returns Lista de rotas da API
 */
export const getAvailableRoutes = async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/routes`);
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Erro ao obter rotas:', error);
    throw error;
  }
};
