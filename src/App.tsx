import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, RefreshCw, History, LogOut, User, Lock, Search, Trash2, Download, GraduationCap, BookOpen, Database, CheckCircle, AlertCircle, MessageCircle, Loader } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { blobToBase64, sendDocumentViaWhatsApp } from '@/services/whatsappService';
import { searchStudentByCPF } from '@/services/siageApi';
import './App.css';

interface FormData {
  nomeAluno: string;
  dataNascimento: string;
  naturalidade: string;
  nomeMae: string;
  nomePai: string;
  serie: string;
  ano: string;
  cpf?: string;
}

interface Declaracao {
  id: string;
  data: string;
  nomeAluno: string;
  serie: string;
  ano: string;
  tipo: 'cursando' | 'cursou';
  modalidade: 'regular' | 'eja';
  status?: string;
  cpf?: string;
}

interface LoginData {
  usuario: string;
  senha: string;
}

// ID da planilha Google Sheets pública
const GOOGLE_SHEET_ID = '1Cb26OyeFQgsYCP_6fI3N961W2Onpk8NXSN2D3iuOycc';

function App() {
  // Estados
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginData, setLoginData] = useState<LoginData>({ usuario: '', senha: '' });
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'formulario' | 'historico'>('formulario');
  const [historico, setHistorico] = useState<Declaracao[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // WhatsApp
  const [numeroWhatsApp, setNumeroWhatsApp] = useState('');
  const [mostrarWhatsAppOpcoes, setMostrarWhatsAppOpcoes] = useState(false);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  
  // Tipo de declaração
  const [tipoDeclaracao, setTipoDeclaracao] = useState<'cursando' | 'cursou'>('cursando');
  const [modalidade, setModalidade] = useState<'regular' | 'eja'>('regular');
  const [statusAluno, setStatusAluno] = useState<'CONCLUINTE' | 'ABANDONO'>('CONCLUINTE');
  
  // Modal de CPF
  const [mostrarModalCPF, setMostrarModalCPF] = useState(false);
  const [cpfBusca, setCpfBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState('');
  
  // Modal de confirmação
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [dadosConfirmados, setDadosConfirmados] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    nomeAluno: '',
    dataNascimento: '',
    naturalidade: '',
    nomeMae: '',
    nomePai: '',
    serie: '',
    ano: new Date().getFullYear().toString(),
    cpf: ''
  });

  const [dataAtual, setDataAtual] = useState('');
  const documentoRef = useRef<HTMLDivElement>(null);

  // Carregar histórico do localStorage
  useEffect(() => {
    const saved = localStorage.getItem('declaracoes');
    if (saved) {
      setHistorico(JSON.parse(saved));
    }
    const hoje = new Date();
    const dia = hoje.getDate().toString().padStart(2, '0');
    const mes = (hoje.getMonth() + 1).toString().padStart(2, '0');
    const ano = hoje.getFullYear();
    setDataAtual(`${dia}/${mes}/${ano}`);
  }, []);

  // Salvar histórico no localStorage
  const salvarHistorico = (novoHistorico: Declaracao[]) => {
    setHistorico(novoHistorico);
    localStorage.setItem('declaracoes', JSON.stringify(novoHistorico));
  };

  // Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.usuario === '25003844' && loginData.senha === '25003844') {
      setIsLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError('Usuário ou senha incorretos');
    }
  };

  // Logout
  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginData({ usuario: '', senha: '' });
    setActiveTab('formulario');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLoginInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLoginData(prev => ({ ...prev, [name]: value }));
  };

  // Formatar CPF
  const formatarCPF = (cpf: string) => {
    return cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  // Função para parse de CSV considerando aspas
  const parseCSV = (linha: string): string[] => {
    const colunas: string[] = [];
    let atual = '';
    let dentroAspas = false;
    
    for (let j = 0; j < linha.length; j++) {
      const char = linha[j];
      if (char === '"') {
        dentroAspas = !dentroAspas;
      } else if (char === ',' && !dentroAspas) {
        colunas.push(atual.trim().replace(/^"|"$/g, ''));
        atual = '';
      } else {
        atual += char;
      }
    }
    colunas.push(atual.trim().replace(/^"|"$/g, ''));
    return colunas;
  };

  // Buscar aluno na planilha pelo CPF (busca por nome de coluna)
  const buscarAlunoPorCPF = async () => {
    if (!cpfBusca) {
      setErroBusca('Digite o CPF do aluno');
      return;
    }

    const cpfLimpo = cpfBusca.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      setErroBusca('CPF inválido. Digite 11 números.');
      return;
    }

    setBuscando(true);
    setErroBusca('');

    try {
      const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Erro ao acessar planilha');
      }

      const csvText = await response.text();
      const linhas = csvText.split('\n');
      if (linhas.length < 2) {
        setErroBusca('Planilha vazia ou formato inválido.');
        setBuscando(false);
        return;
      }

      const cabecalho = parseCSV(linhas[0]);

      const getIndice = (nomes: string[]): number => {
        for (const nome of nomes) {
          const idx = cabecalho.findIndex(h => 
            h.toUpperCase().trim() === nome.toUpperCase()
          );
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const indices = {
        cpf: getIndice(['CPF']),
        nome: getIndice(['NOME', 'NOME ALUNO', 'NOME DO ALUNO', 'ALUNO']),
        dataNascimento: getIndice(['NASCIMENTO', 'DATA NASCIMENTO', 'DATA_NASCIMENTO', 'DATA DE NASCIMENTO', 'DT NASCIMENTO', 'DATA_NASC', 'DT_NASC']),
        nomeMae: getIndice(['NOME MAE', 'NOME_MAE', 'NOME DA MAE', 'MAE', 'NOME MÃE', 'MÃE']),
        nomePai: getIndice(['NOME PAI', 'NOME_PAI', 'NOME DO PAI', 'PAI']),
        serie: getIndice(['SERIE', 'SÉRIE', 'ANO SERIE', 'ANO']),
        ano: getIndice(['ANO LETIVO', 'ANO_LETIVO', 'ANO'])
      };

      if (indices.cpf === -1) {
        setErroBusca('Coluna CPF não encontrada na planilha.');
        setBuscando(false);
        return;
      }

      let alunoEncontrado = null;

      for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i].trim();
        if (!linha) continue;

        const colunas = parseCSV(linha);
        const cpfPlanilha = colunas[indices.cpf] ? colunas[indices.cpf].replace(/\D/g, '') : '';

        if (cpfPlanilha === cpfLimpo) {
          const limparSerie = (serie: string): string => {
            if (!serie) return '';
            const match = serie.match(/(\d+)[ºª]/);
            if (match) return match[0];
            return serie.replace(/\D/g, '');
          };

          alunoEncontrado = {
            nome: indices.nome !== -1 ? colunas[indices.nome] : '',
            dataNascimento: indices.dataNascimento !== -1 ? colunas[indices.dataNascimento] : '',
            naturalidade: '',
            nomeMae: indices.nomeMae !== -1 ? colunas[indices.nomeMae] : '',
            nomePai: indices.nomePai !== -1 ? colunas[indices.nomePai] : '',
            serie: indices.serie !== -1 ? limparSerie(colunas[indices.serie]) : '',
            ano: indices.ano !== -1 ? colunas[indices.ano] : new Date().getFullYear().toString()
          };
          break;
        }
      }

      if (!alunoEncontrado) {
        setErroBusca(`Aluno com CPF ${formatarCPF(cpfLimpo)} não encontrado na planilha.`);
        setBuscando(false);
        return;
      }

      setFormData({
        nomeAluno: alunoEncontrado.nome,
        dataNascimento: alunoEncontrado.dataNascimento,
        naturalidade: '',
        nomeMae: alunoEncontrado.nomeMae,
        nomePai: alunoEncontrado.nomePai,
        serie: alunoEncontrado.serie,
        ano: alunoEncontrado.ano,
        cpf: formatarCPF(cpfLimpo)
      });

      setMostrarModalCPF(false);
      setMostrarConfirmacao(true);
      setBuscando(false);
    } catch (error) {
      console.error('Erro na busca:', error);
      setErroBusca('Erro ao buscar dados na planilha. Tente novamente.');
      setBuscando(false);
    }
  };
  // Buscar aluno no SIAGE pelo CPF
  const buscarAlunoNoSiage = async () => {
    if (!cpfBusca) {
      setErroBusca('Digite o CPF do aluno');
      return;
    }

    const cpfLimpo = cpfBusca.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      setErroBusca('CPF inválido. Digite 11 números.');
      return;
    }

    setBuscando(true);
    setErroBusca('');

    try {
      console.log('🔍 Buscando aluno no SIAGE...');
      
      // Chamar o backend para buscar dados no SIAGE
      const studentData = await searchStudentByCPF(cpfBusca);

      // Formatar data de nascimento para o formato esperado
      const dataNascFormatada = studentData.dataNascimento || '';

      // Preencher o formulário com os dados do SIAGE
      setFormData({
        nomeAluno: studentData.nomeAluno || '',
        cpf: studentData.cpf || cpfLimpo,
        dataNascimento: dataNascFormatada,
        naturalidade: studentData.naturalidade || '',
        nomeMae: studentData.nomeMae || '',
        nomePai: studentData.nomePai || '',
        serie: studentData.serie || '',
        ano: studentData.ano || new Date().getFullYear().toString()
      });

      console.log('✓ Dados do aluno carregados do SIAGE');

      setMostrarModalCPF(false);
      setMostrarConfirmacao(true);
      setBuscando(false);

    } catch (error) {
      console.error('Erro ao buscar no SIAGE:', error);
      
      // Se falhar no SIAGE, tentar na planilha como fallback
      console.log('⚠️ Tentando buscar na planilha como alternativa...');
      await buscarAlunoPorCPF();
    }
  };


  const confirmarDados = () => {
    setDadosConfirmados(true);
    setMostrarConfirmacao(false);
  };

  const editarDados = () => {
    setMostrarConfirmacao(false);
    setDadosConfirmados(true);
  };

  const pularBusca = () => {
    setMostrarModalCPF(false);
    setDadosConfirmados(true);
    limparFormulario();
  };

  const gerarPDF = async (): Promise<Blob | null> => {
    if (documentoRef.current) {
      const opt = {
        margin: 0,
        filename: `Declaracao_${tipoDeclaracao === 'cursando' ? 'Matricula' : 'Conclusao'}_${modalidade === 'eja' ? 'EJA_' : ''}${formData.nomeAluno.replace(/\s+/g, '_') || 'Aluno'}.pdf`,
        image: { type: 'jpeg' as const, quality: 1 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false
        },
        jsPDF: { 
          unit: 'mm' as const, 
          format: 'a4' as const, 
          orientation: 'portrait' as const
        }
      };

      const pdf = await html2pdf().set(opt).from(documentoRef.current).output('blob');
      return pdf;
    }
    return null;
  };

  const baixarPDF = async () => {
    const pdf = await gerarPDF();
    if (pdf) {
      const novaDeclaracao: Declaracao = {
        id: Date.now().toString(),
        data: new Date().toISOString(),
        nomeAluno: formData.nomeAluno || '[NOME DO ALUNO]',
        serie: formData.serie || '[SÉRIE]',
        ano: formData.ano,
        tipo: tipoDeclaracao,
        modalidade: modalidade,
        status: tipoDeclaracao === 'cursou' ? statusAluno : undefined,
        cpf: formData.cpf
      };
      salvarHistorico([novaDeclaracao, ...historico]);

      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Declaracao_${tipoDeclaracao === 'cursando' ? 'Matricula' : 'Conclusao'}_${modalidade === 'eja' ? 'EJA_' : ''}${formData.nomeAluno.replace(/\s+/g, '_') || 'Aluno'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const enviarViaWhatsApp = async () => {
    if (!numeroWhatsApp) {
      alert('Por favor, digite o número do WhatsApp');
      return;
    }

    setEnviandoWhatsApp(true);
    try {
      const pdf = await gerarPDF();
      if (!pdf) {
        alert('Erro ao gerar PDF');
        setEnviandoWhatsApp(false);
        return;
      }

      const base64 = await blobToBase64(pdf);
      const modalidadeTexto = modalidade === 'eja' ? ' EJA' : '';
      const tipoTexto = tipoDeclaracao === 'cursando' ? `Declaração de Matrícula${modalidadeTexto}` : `Declaração de Conclusão${modalidadeTexto}`;
      const fileName = `Declaracao_${tipoDeclaracao === 'cursando' ? 'Matricula' : 'Conclusao'}_${modalidade === 'eja' ? 'EJA_' : ''}${formData.nomeAluno.replace(/\s+/g, '_') || 'Aluno'}.pdf`;

      const result = await sendDocumentViaWhatsApp({
        phoneNumber: numeroWhatsApp,
        pdfBase64: base64,
        fileName: fileName,
        caption: `${tipoTexto} - ${formData.nomeAluno}`
      });

      if (result.success) {
        // Salvar no histórico
        const novaDeclaracao: Declaracao = {
          id: Date.now().toString(),
          data: new Date().toISOString(),
          nomeAluno: formData.nomeAluno || '[NOME DO ALUNO]',
          serie: formData.serie || '[SÉRIE]',
          ano: formData.ano,
          tipo: tipoDeclaracao,
          modalidade: modalidade,
          status: tipoDeclaracao === 'cursou' ? statusAluno : undefined,
          cpf: formData.cpf
        };
        salvarHistorico([novaDeclaracao, ...historico]);

        // Abrir WhatsApp Web
        const cleanPhone = numeroWhatsApp.replace(/\D/g, '');
        const message = encodeURIComponent(`Olá! Segue em anexo a ${tipoTexto} do(a) aluno(a) ${formData.nomeAluno}.`);
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');

        alert('Arquivo pronto para envio! Abra o WhatsApp Web para enviar.');
        setNumeroWhatsApp('');
        setMostrarWhatsAppOpcoes(false);
      } else {
        alert(`Erro: ${result.error}`);
      }
    } catch (error) {
      console.error('Erro ao enviar via WhatsApp:', error);
      alert('Erro ao processar o envio. Tente novamente.');
    } finally {
      setEnviandoWhatsApp(false);
    }
  };

  const limparFormulario = () => {
    setFormData({
      nomeAluno: '',
      dataNascimento: '',
      naturalidade: '',
      nomeMae: '',
      nomePai: '',
      serie: '',
      ano: new Date().getFullYear().toString(),
      cpf: ''
    });
    setNumeroWhatsApp('');
    setCpfBusca('');
  };

  const excluirDeclaracao = (id: string) => {
    const novoHistorico = historico.filter(d => d.id !== id);
    salvarHistorico(novoHistorico);
  };

  const carregarDeclaracao = (declaracao: Declaracao) => {
    setFormData(prev => ({
      ...prev,
      nomeAluno: declaracao.nomeAluno,
      serie: declaracao.serie,
      ano: declaracao.ano,
      cpf: declaracao.cpf || ''
    }));
    setTipoDeclaracao(declaracao.tipo);
    setModalidade(declaracao.modalidade);
    if (declaracao.status) {
      setStatusAluno(declaracao.status as 'CONCLUINTE' | 'ABANDONO');
    }
    setDadosConfirmados(true);
    setActiveTab('formulario');
  };

  const historicoFiltrado = historico.filter(d => 
    d.nomeAluno.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const nomeAluno = formData.nomeAluno || '[NOME DO ALUNO]';
  const dataNascimento = formData.dataNascimento || '[DATA DE NASCIMENTO]';
  const naturalidade = formData.naturalidade || '[NATURALIDADE]';
  const nomeMae = formData.nomeMae || '[NOME DA MÃE]';
  const nomePai = formData.nomePai || '[NOME DO PAI]';
  const serie = formData.serie || '[SÉRIE]';
  const ano = formData.ano || '[ANO]';

  // Texto dinâmico baseado no tipo e modalidade
  const verboCursar = tipoDeclaracao === 'cursando' ? 'cursa' : 'cursou';
  const statusTexto = tipoDeclaracao === 'cursando' ? 'ATIVO(A)' : statusAluno;
  
  // Texto da série conforme modalidade
  const textoSerie = modalidade === 'eja' 
    ? `o ${serie}, na modalidade EJA (Ensino de Jovens e Adultos)`
    : `a ${serie} série do Ensino Médio`;

  // Tela de Login
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <img src="/assets/logo-escola.jpeg" alt="Logo da Escola" className="w-24 h-24 mx-auto mb-4 rounded-full shadow-lg" />
              <h1 className="text-2xl font-bold text-blue-900">EEEFM João Silveira Guimarães</h1>
              <p className="text-gray-500 mt-1">Sistema de Declarações</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="usuario" className="text-gray-700">Usuário</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input 
                    id="usuario" 
                    name="usuario" 
                    value={loginData.usuario} 
                    onChange={handleLoginInputChange} 
                    placeholder="Digite seu usuário"
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="senha" className="text-gray-700">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input 
                    id="senha" 
                    name="senha" 
                    type="password"
                    value={loginData.senha} 
                    onChange={handleLoginInputChange} 
                    placeholder="Digite sua senha"
                    className="pl-10"
                  />
                </div>
              </div>
              
              {loginError && (
                <p className="text-red-500 text-sm text-center">{loginError}</p>
              )}
              
              <Button type="submit" className="w-full bg-blue-900 hover:bg-blue-800 py-6 text-lg">
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tela Principal
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white py-4 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/assets/logo-escola.jpeg" alt="Logo" className="w-12 h-12 rounded-full border-2 border-yellow-400" />
            <div>
              <h1 className="text-xl font-bold">EEEFM João Silveira Guimarães</h1>
              <p className="text-sm text-blue-200">Sistema de Declarações de Matrícula</p>
            </div>
          </div>
          <Button onClick={handleLogout} variant="outline" className="border-white text-white hover:bg-white hover:text-blue-900">
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </header>

      {/* Navegação */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('formulario')}
              className={`py-4 px-6 font-medium border-b-2 transition-colors ${
                activeTab === 'formulario' 
                  ? 'border-blue-900 text-blue-900' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Nova Declaração
            </button>
            <button 
              onClick={() => setActiveTab('historico')}
              className={`py-4 px-6 font-medium border-b-2 transition-colors ${
                activeTab === 'historico' 
                  ? 'border-blue-900 text-blue-900' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <History className="w-4 h-4 inline mr-2" />
              Histórico ({historico.length})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {activeTab === 'formulario' ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Formulário */}
            <div className="space-y-4">
              {/* Tipo de Declaração */}
              <Card className="shadow-lg border-t-4 border-t-purple-600">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-white">
                  <CardTitle className="text-lg text-purple-700 flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Tipo de Declaração
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {/* Tipo: Cursando ou Cursou */}
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => {
                        setTipoDeclaracao('cursando');
                        setDadosConfirmados(false);
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        tipoDeclaracao === 'cursando'
                          ? 'border-blue-900 bg-blue-50 text-blue-900'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <GraduationCap className="w-8 h-8 mx-auto mb-2" />
                      <p className="font-medium">Cursando</p>
                      <p className="text-xs text-gray-500 mt-1">Aluno matriculado</p>
                    </button>
                    <button
                      onClick={() => {
                        setTipoDeclaracao('cursou');
                        setDadosConfirmados(true);
                        limparFormulario();
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        tipoDeclaracao === 'cursou'
                          ? 'border-purple-900 bg-purple-50 text-purple-900'
                          : 'border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      <BookOpen className="w-8 h-8 mx-auto mb-2" />
                      <p className="font-medium">Cursou</p>
                      <p className="text-xs text-gray-500 mt-1">Aluno concluiu/abandonou</p>
                    </button>
                  </div>

                  {/* Modalidade: Regular ou EJA */}
                  <div className="mt-4">
                    <Label className="text-gray-700 mb-3 block">Modalidade:</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          setModalidade('regular');
                          if (tipoDeclaracao === 'cursando') {
                            setDadosConfirmados(false);
                            setMostrarModalCPF(true);
                          }
                        }}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          modalidade === 'regular'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <p className="font-medium">📚 Regular</p>
                        <p className="text-xs text-gray-500">Ensino Médio</p>
                      </button>
                      <button
                        onClick={() => {
                          setModalidade('eja');
                          if (tipoDeclaracao === 'cursando') {
                            setDadosConfirmados(false);
                            setMostrarModalCPF(true);
                          }
                        }}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          modalidade === 'eja'
                            ? 'border-green-600 bg-green-50 text-green-700'
                            : 'border-gray-200 hover:border-green-300'
                        }`}
                      >
                        <p className="font-medium">👥 EJA</p>
                        <p className="text-xs text-gray-500">Jovens e Adultos</p>
                      </button>
                    </div>
                  </div>

                  {/* Status (apenas para tipo "cursou") */}
                  {tipoDeclaracao === 'cursou' && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <Label className="text-gray-700 mb-3 block">Status do Aluno:</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setStatusAluno('CONCLUINTE')}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            statusAluno === 'CONCLUINTE'
                              ? 'border-green-600 bg-green-50 text-green-700'
                              : 'border-gray-200 hover:border-green-300'
                          }`}
                        >
                          <p className="font-medium">✓ CONCLUINTE</p>
                        </button>
                        <button
                          onClick={() => setStatusAluno('ABANDONO')}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            statusAluno === 'ABANDONO'
                              ? 'border-red-600 bg-red-50 text-red-700'
                              : 'border-gray-200 hover:border-red-300'
                          }`}
                        >
                          <p className="font-medium">✗ ABANDONO</p>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Botão para buscar novamente (Cursando) */}
                  {tipoDeclaracao === 'cursando' && dadosConfirmados && (
                    <Button 
                      onClick={() => setMostrarModalCPF(true)}
                      variant="outline"
                      className="w-full mt-4 border-blue-900 text-blue-900"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Buscar outro aluno por CPF
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Dados do Aluno */}
              <Card className={`shadow-lg h-fit border-t-4 ${dadosConfirmados ? 'border-t-green-600' : 'border-t-gray-300'}`}>
                <CardHeader className={`bg-gradient-to-r ${dadosConfirmados ? 'from-green-50 to-white' : 'from-gray-50 to-white'}`}>
                  <CardTitle className={`text-lg ${dadosConfirmados ? 'text-green-700' : 'text-gray-500'} flex items-center gap-2`}>
                    {dadosConfirmados ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    Dados do Aluno
                    {formData.cpf && <span className="text-sm font-normal text-gray-500">(CPF: {formData.cpf})</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {!dadosConfirmados && tipoDeclaracao === 'cursando' && (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-center">
                      <p className="text-yellow-800">Selecione a modalidade e digite o CPF do aluno</p>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="nomeAluno" className="text-gray-700">Nome do Aluno</Label>
                    <Input id="nomeAluno" name="nomeAluno" value={formData.nomeAluno} onChange={handleInputChange} placeholder="Digite o nome completo do aluno" className="uppercase focus:ring-blue-900" disabled={!dadosConfirmados} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dataNascimento" className="text-gray-700">Data de Nascimento</Label>
                      <Input id="dataNascimento" name="dataNascimento" value={formData.dataNascimento} onChange={handleInputChange} placeholder="DD/MM/AAAA" disabled={!dadosConfirmados} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="naturalidade" className="text-gray-700">Naturalidade *</Label>
                      <Input id="naturalidade" name="naturalidade" value={formData.naturalidade} onChange={handleInputChange} placeholder="Cidade/UF" className="uppercase" disabled={!dadosConfirmados} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nomeMae" className="text-gray-700">Nome da Mãe</Label>
                    <Input id="nomeMae" name="nomeMae" value={formData.nomeMae} onChange={handleInputChange} placeholder="Digite o nome completo da mãe" className="uppercase" disabled={!dadosConfirmados} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nomePai" className="text-gray-700">Nome do Pai</Label>
                    <Input id="nomePai" name="nomePai" value={formData.nomePai} onChange={handleInputChange} placeholder="Digite o nome completo do pai" className="uppercase" disabled={!dadosConfirmados} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="serie" className="text-gray-700">Série</Label>
                      <Input id="serie" name="serie" value={formData.serie} onChange={handleInputChange} placeholder="Ex: 1º, 2º, 3º" disabled={!dadosConfirmados} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ano" className="text-gray-700">Ano Letivo</Label>
                      <Input id="ano" name="ano" value={formData.ano} onChange={handleInputChange} placeholder="Ex: 2025" disabled={!dadosConfirmados} />
                    </div>
                  </div>
                </CardContent>
              </Card>


              {/* Envio por WhatsApp */}
              {dadosConfirmados && (
                <Card className="shadow-lg border-t-4 border-t-green-600">
                  <CardHeader className="bg-gradient-to-r from-green-50 to-white">
                    <CardTitle className="text-lg text-green-700 flex items-center gap-2">
                      <MessageCircle className="w-5 h-5" />
                      Enviar via WhatsApp
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="numeroWhatsApp" className="text-gray-700">
                        Número do WhatsApp (com DDD)
                      </Label>
                      <Input 
                        id="numeroWhatsApp"
                        value={numeroWhatsApp}
                        onChange={(e) => setNumeroWhatsApp(e.target.value)}
                        placeholder="Ex: 83 98765-4321 ou 83987654321"
                        className="focus:ring-green-600"
                      />
                      <p className="text-xs text-gray-500">Digite o número com DDD. Exemplo: 83 ou 85</p>
                    </div>
                    
                    <Button 
                      onClick={enviarViaWhatsApp}
                      disabled={enviandoWhatsApp || !numeroWhatsApp}
                      className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 py-5"
                    >
                      {enviandoWhatsApp ? (
                        <>
                          <Loader className="w-4 h-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Enviar via WhatsApp
                        </>
                      )}
                    </Button>
                    
                    {mostrarWhatsAppOpcoes && (
                      <div className="bg-green-50 border border-green-300 rounded-lg p-4 text-sm text-green-800">
                        <p className="font-medium mb-2">✓ Arquivo pronto para envio!</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>O WhatsApp Web foi aberto em uma nova aba</li>
                          <li>Selecione o contato ou grupo</li>
                          <li>Clique no ícone de clipe 📎</li>
                          <li>Selecione o arquivo PDF baixado</li>
                          <li>Envie a mensagem</li>
                        </ol>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Botões de Ação */}
              {dadosConfirmados && (
                <div className="flex gap-3">
                  <Button onClick={baixarPDF} className="flex-1 bg-gradient-to-r from-blue-900 to-blue-800 hover:from-blue-800 hover:to-blue-700 py-6">
                    <Download className="w-5 h-5 mr-2" /> 
                    Baixar PDF
                  </Button>
                  <Button onClick={limparFormulario} variant="outline" className="border-gray-300 px-6">
                    <RefreshCw className="w-5 h-5 mr-2" /> Limpar
                  </Button>
                </div>
              )}
            </div>

            {/* Pré-visualização */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-700">
                  Pré-visualização: {tipoDeclaracao === 'cursando' ? 'Declaração de Matrícula' : 'Declaração de Conclusão'}
                  {modalidade === 'eja' && ' - EJA'}
                </h2>
                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Data: {dataAtual}</span>
              </div>
              
              {/* Container do PDF */}
              <div 
                style={{
                  width: '210mm',
                  height: '297mm',
                  margin: '0 auto',
                  background: 'white',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                  opacity: dadosConfirmados ? 1 : 0.5
                }}
              >
                <div 
                  ref={documentoRef}
                  style={{
                    width: '210mm',
                    height: '297mm',
                    padding: '15mm 20mm',
                    boxSizing: 'border-box',
                    fontFamily: 'Times New Roman, Times, serif',
                    fontSize: '12pt',
                    lineHeight: '1.5',
                    color: '#000',
                    background: 'white'
                  }}
                >
                  {/* Cabeçalho */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8mm' }}>
                    <img src="/assets/image4.jpg" alt="Secretaria" style={{ height: '18mm', width: 'auto' }} />
                    <img src="/assets/image1.jpg" alt="Governo da Paraíba" style={{ height: '22mm', width: 'auto' }} />
                  </div>

                  {/* Cabeçalho Central */}
                  <div style={{ textAlign: 'center', marginBottom: '10mm' }}>
                    <p style={{ fontWeight: 'bold', fontSize: '12pt', margin: '2mm 0' }}>GOVERNO DO ESTADO DA PARAIBA</p>
                    <p style={{ fontWeight: 'bold', fontSize: '12pt', margin: '2mm 0' }}>SECRETARIA DE ESTADO DA EDUCAÇÃO</p>
                    <p style={{ fontWeight: 'bold', fontSize: '12pt', margin: '2mm 0' }}>8ª GERÊNCIA REGIONAL DE ENSINO</p>
                    <p style={{ fontWeight: 'bold', fontSize: '12pt', margin: '2mm 0' }}>EEEFM JOÃO SILVEIRA GUIMARÃES</p>
                    <p style={{ fontWeight: 'bold', fontSize: '12pt', margin: '2mm 0' }}>INEP 25003844</p>
                  </div>

                  {/* Título */}
                  <div style={{ textAlign: 'center', marginBottom: '12mm' }}>
                    <h2 style={{ fontWeight: 'bold', fontSize: '14pt', textDecoration: 'underline' }}>DECLARAÇÃO</h2>
                  </div>

                  {/* Corpo do texto */}
                  <div style={{ textAlign: 'justify', marginBottom: '8mm' }}>
                    <p style={{ fontSize: '12pt', lineHeight: '1.6' }}>
                      Declaramos para os devidos fins de direito que <strong>{nomeAluno}</strong><strong>,</strong> nascido(a) em <strong>{dataNascimento}</strong>, na cidade de <strong>{naturalidade}</strong>, filho(a) de <strong>{nomeMae}</strong> E <strong>{nomePai}</strong> {verboCursar} na referida instituição de ensino {textoSerie} no ano de <strong>{ano}</strong>, sendo considerado(a) <strong>{statusTexto}</strong>.
                    </p>
                  </div>

                  <div style={{ textAlign: 'justify', marginBottom: '15mm' }}>
                    <p style={{ fontSize: '12pt', lineHeight: '1.6' }}>Para que surtam efeitos legais dato e assino a presente declaração.</p>
                  </div>

                  {/* Data */}
                  <div style={{ textAlign: 'center', marginBottom: '20mm' }}>
                    <p style={{ fontSize: '12pt' }}>São Bento-PB, {dataAtual}</p>
                  </div>

                  {/* Carimbo da Escola */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15mm' }}>
                    <img src="/assets/image3.png" alt="Carimbo da Escola" style={{ height: '30mm', width: 'auto' }} />
                  </div>

                  {/* SECRETÁRIO ESCOLAR + Assinatura + Linha */}
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontWeight: 'bold', fontSize: '12pt', marginBottom: '5mm' }}>SECRETÁRIO ESCOLAR</p>
                    
                    {/* Assinatura */}
                    <img src="/assets/image2.png" alt="Assinatura" style={{ height: '30mm', width: 'auto', display: 'block', margin: '0 auto' }} />
                    
                    {/* Linha de assinatura */}
                    <p style={{ letterSpacing: '2px', margin: '3mm 0', fontSize: '12pt' }}>__________________________________________</p>
                    
                    {/* Carimbo do Secretário */}
                    <img src="/assets/image5.png" alt="Carimbo do Secretário" style={{ height: '28mm', width: 'auto' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Histórico */
          <Card className="shadow-lg border-t-4 border-t-blue-900">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-white">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-blue-900">Histórico de Declarações</CardTitle>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input 
                    placeholder="Buscar por nome..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {historicoFiltrado.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <History className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">Nenhuma declaração encontrada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historicoFiltrado.map((declaracao) => (
                    <div key={declaracao.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{declaracao.nomeAluno}</p>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            declaracao.tipo === 'cursando' 
                              ? 'bg-blue-100 text-blue-700' 
                              : declaracao.status === 'CONCLUINTE'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {declaracao.tipo === 'cursando' ? 'Cursando' : declaracao.status}
                          </span>
                          {declaracao.modalidade === 'eja' && (
                            <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                              EJA
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {declaracao.serie} série - {declaracao.ano} • {new Date(declaracao.data).toLocaleDateString('pt-BR')}
                          {declaracao.cpf && ` • CPF: ${declaracao.cpf}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => carregarDeclaracao(declaracao)}
                          className="text-blue-900 border-blue-900 hover:bg-blue-50"
                        >
                          <FileText className="w-4 h-4 mr-1" /> Ver
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => excluirDeclaracao(declaracao.id)}
                          className="text-red-600 border-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de Busca por CPF */}
      <Dialog open={mostrarModalCPF} onOpenChange={setMostrarModalCPF}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-900">
              <Database className="w-5 h-5" />
              Buscar Aluno na Planilha
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-500">
              Digite o CPF do aluno para buscar os dados automaticamente na planilha de matriculados.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cpfBusca">CPF do Aluno</Label>
              <Input
                id="cpfBusca"
                value={cpfBusca}
                onChange={(e) => setCpfBusca(e.target.value)}
                placeholder="000.000.000-00"
                maxLength={14}
              />
            </div>
            {erroBusca && (
              <p className="text-red-500 text-sm">{erroBusca}</p>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={pularBusca}>
              Preencher Manualmente
            </Button>
            <Button 
              onClick={buscarAlunoNoSiage} 
              disabled={buscando}
              className="bg-blue-900 hover:bg-blue-800"
            >
              {buscando ? 'Buscando...' : 'Buscar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Dados */}
      <Dialog open={mostrarConfirmacao} onOpenChange={setMostrarConfirmacao}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5" />
              Confirme os Dados do Aluno
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <p><strong>Nome:</strong> {formData.nomeAluno}</p>
              <p><strong>Data de Nascimento:</strong> {formData.dataNascimento}</p>
              <p><strong>Mãe:</strong> {formData.nomeMae}</p>
              <p><strong>Pai:</strong> {formData.nomePai}</p>
              <p><strong>Série:</strong> {formData.serie}</p>
              <p><strong>Ano:</strong> {formData.ano}</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Atenção:</strong> O campo <strong>Naturalidade</strong> deverá ser preenchido manualmente.
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={editarDados}>
              Editar Dados
            </Button>
            <Button 
              onClick={confirmarDados}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirmar e Prosseguir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
