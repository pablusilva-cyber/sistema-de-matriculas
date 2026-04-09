import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';

interface Student {
  serie: string;
  turma: string;
  nome_civil: string;
  nome_social: string;
  data_nascimento: string;
  cpf: string;
  filacao_mae: string;
  filacao_pai: string;
}

interface SIAGEImporterProps {
  onImportComplete?: (students: Student[]) => void;
  onClose?: () => void;
}

export const SIAGEImporter: React.FC<SIAGEImporterProps> = ({
  onImportComplete,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const handleImportFromSIAGE = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Chamar o script Python para extrair dados do SIAGE
      const response = await fetch('/api/siage/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format: 'json',
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao extrair dados do SIAGE');
      }

      const data = await response.json();
      const students: Student[] = data.students || [];

      setImportedCount(students.length);
      setSuccess(true);

      if (onImportComplete) {
        onImportComplete(students);
      }

      // Limpar mensagens após 3 segundos
      setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro desconhecido ao importar dados'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Importar do SIAGE
        </h2>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-semibold text-red-800">Erro</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-semibold text-green-800">Sucesso!</p>
              <p className="text-green-700 text-sm">
                {importedCount} alunos importados com sucesso
              </p>
            </div>
          </div>
        )}

        <p className="text-gray-600 mb-6">
          Clique no botão abaixo para extrair todos os dados de alunos do SIAGE
          e importar para o sistema.
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleImportFromSIAGE}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader size={18} className="animate-spin" />
                Importando...
              </>
            ) : (
              'Importar do SIAGE'
            )}
          </button>

          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-lg transition"
          >
            Cancelar
          </button>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Campos importados:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✓ Série/Ano</li>
            <li>✓ Turma</li>
            <li>✓ Data de Nascimento</li>
            <li>✓ CPF</li>
            <li>✓ Filiação - Mãe</li>
            <li>✓ Filiação - Pai</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
