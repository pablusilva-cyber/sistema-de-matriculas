#!/usr/bin/env python3
"""
Script Final de Extração de Dados do SIAGE
Segue o fluxo correto de navegação e extrai dados dos estudantes
"""

import os
import sys
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup
import pandas as pd
from urllib.parse import urljoin

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('siage_extraction_final.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class SiageExtractorFinal:
    """Classe para extrair dados do SIAGE seguindo fluxo correto"""
    
    def __init__(self, username: str, password: str):
        """
        Inicializar o extrator
        
        Args:
            username: Usuário (CPF)
            password: Senha
        """
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self.base_url = "https://escola.see.pb.gov.br"
        
    def step1_login(self) -> bool:
        """Passo 1: Fazer login"""
        try:
            logger.info("=" * 60)
            logger.info("PASSO 1: Login")
            logger.info("=" * 60)
            
            url = f"{self.base_url}/auth"
            logger.info(f"Acessando: {url}")
            
            # GET inicial para obter cookies
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            logger.info(f"Status: {response.status_code}")
            
            # Fazer login com GET
            logger.info("Enviando credenciais...")
            login_params = {
                'usuario': self.username,
                'senha': self.password,
            }
            
            response = self.session.get(url, params=login_params, timeout=30, allow_redirects=True)
            response.raise_for_status()
            
            logger.info(f"Redirecionado para: {response.url}")
            
            if 'selecionar-ano-letivo' in response.url:
                logger.info("✅ Login bem-sucedido!")
                return True
            else:
                logger.error("❌ Login falhou")
                return False
                
        except Exception as e:
            logger.error(f"❌ Erro no login: {str(e)}")
            return False
    
    def step2_select_year(self) -> bool:
        """Passo 2: Selecionar ano letivo"""
        try:
            logger.info("=" * 60)
            logger.info("PASSO 2: Selecionar Ano Letivo")
            logger.info("=" * 60)
            
            url = f"{self.base_url}/auth/selecionar-ano-letivo"
            logger.info(f"Acessando: {url}")
            
            # GET para obter página
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            logger.info(f"Status: {response.status_code}")
            
            # Fazer POST para selecionar ano
            logger.info("Selecionando ano letivo 2026...")
            post_data = {'anoLetivo': '2026'}
            
            response = self.session.post(url, data=post_data, timeout=30, allow_redirects=True)
            response.raise_for_status()
            
            logger.info(f"Redirecionado para: {response.url}")
            
            if 'painel-turmas' in response.url or 'meus-estudantes' in response.url:
                logger.info("✅ Ano letivo selecionado!")
                return True
            else:
                logger.warning("⚠️ Redirecionamento inesperado, continuando...")
                return True
                
        except Exception as e:
            logger.error(f"❌ Erro ao selecionar ano: {str(e)}")
            return False
    
    def step3_navigate_to_students(self) -> bool:
        """Passo 3: Navegar para página de estudantes"""
        try:
            logger.info("=" * 60)
            logger.info("PASSO 3: Navegar para Controle de Estudantes")
            logger.info("=" * 60)
            
            # Tentar acessar diretamente a página de controle
            url = f"{self.base_url}/meus-estudantes/controle-estudantes"
            logger.info(f"Acessando: {url}")
            
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            logger.info(f"Status: {response.status_code}")
            
            if 'controle-estudantes' in response.url or 'meus-estudantes' in response.url:
                logger.info("✅ Página de estudantes acessada!")
                self.students_html = response.text
                return True
            else:
                logger.error("❌ Falha ao acessar página de estudantes")
                return False
                
        except Exception as e:
            logger.error(f"❌ Erro ao navegar: {str(e)}")
            return False
    
    def step4_extract_students(self) -> List[Dict]:
        """Passo 4: Extrair dados dos estudantes"""
        try:
            logger.info("=" * 60)
            logger.info("PASSO 4: Extrair Dados dos Estudantes")
            logger.info("=" * 60)
            
            soup = BeautifulSoup(self.students_html, 'html.parser')
            students = []
            
            # Procurar por tabelas
            tables = soup.find_all('table')
            logger.info(f"Encontradas {len(tables)} tabelas")
            
            for table_idx, table in enumerate(tables):
                logger.info(f"Processando tabela {table_idx + 1}...")
                
                # Encontrar todas as linhas
                rows = table.find_all('tr')
                logger.info(f"  Encontradas {len(rows)} linhas")
                
                for row_idx, row in enumerate(rows):
                    try:
                        # Pular header
                        if row_idx == 0:
                            continue
                        
                        cells = row.find_all('td')
                        
                        # Esperar pelo menos 7 células
                        if len(cells) >= 7:
                            student = {
                                'nome': cells[0].get_text(strip=True),
                                'cpf': cells[1].get_text(strip=True),
                                'serie': cells[2].get_text(strip=True),
                                'escola_origem': cells[3].get_text(strip=True),
                                'selecionou_escola': cells[4].get_text(strip=True),
                                'veterano': cells[5].get_text(strip=True),
                                'situacao': cells[6].get_text(strip=True),
                            }
                            
                            # Normalizar dados vazios
                            for key in student:
                                value = student[key]
                                if value == '-' or value == '' or value.lower() == 'none':
                                    student[key] = None
                            
                            # Validar dados
                            if student['nome']:
                                students.append(student)
                                logger.info(f"    [{row_idx}] {student['nome']} - Série: {student['serie']}")
                    
                    except Exception as e:
                        logger.warning(f"    Erro ao processar linha {row_idx}: {str(e)}")
                        continue
            
            logger.info(f"✅ {len(students)} estudantes extraídos")
            return students
            
        except Exception as e:
            logger.error(f"❌ Erro ao extrair dados: {str(e)}")
            return []
    
    def save_to_csv(self, students: List[Dict], filename: str = "estudantes.csv") -> bool:
        """Salvar em CSV"""
        try:
            logger.info(f"Salvando em {filename}...")
            df = pd.DataFrame(students)
            df.to_csv(filename, index=False, encoding='utf-8')
            logger.info(f"✅ Arquivo salvo: {filename}")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao salvar CSV: {str(e)}")
            return False
    
    def save_to_json(self, students: List[Dict], filename: str = "estudantes.json") -> bool:
        """Salvar em JSON"""
        try:
            logger.info(f"Salvando em {filename}...")
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(students, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Arquivo salvo: {filename}")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao salvar JSON: {str(e)}")
            return False
    
    def save_to_excel(self, students: List[Dict], filename: str = "estudantes.xlsx") -> bool:
        """Salvar em Excel"""
        try:
            logger.info(f"Salvando em {filename}...")
            df = pd.DataFrame(students)
            df.to_excel(filename, index=False, sheet_name='Estudantes')
            logger.info(f"✅ Arquivo salvo: {filename}")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao salvar Excel: {str(e)}")
            return False
    
    def run(self, output_format: str = "csv") -> Optional[List[Dict]]:
        """Executar processo completo"""
        try:
            logger.info("\n" + "=" * 60)
            logger.info("SIAGE Data Extractor - Fluxo Completo")
            logger.info("=" * 60)
            logger.info(f"Usuário: {self.username}")
            logger.info(f"Formato de saída: {output_format}")
            logger.info("=" * 60 + "\n")
            
            if not self.step1_login():
                logger.error("Falha no login")
                return None
            
            if not self.step2_select_year():
                logger.error("Falha ao selecionar ano")
                return None
            
            if not self.step3_navigate_to_students():
                logger.error("Falha ao navegar")
                return None
            
            students = self.step4_extract_students()
            
            if students:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                
                if output_format.lower() == "csv":
                    filename = f"estudantes_{timestamp}.csv"
                    self.save_to_csv(students, filename)
                elif output_format.lower() == "json":
                    filename = f"estudantes_{timestamp}.json"
                    self.save_to_json(students, filename)
                elif output_format.lower() == "excel":
                    filename = f"estudantes_{timestamp}.xlsx"
                    self.save_to_excel(students, filename)
                
                logger.info(f"\n✅ Extração concluída com sucesso!")
                logger.info(f"Total de estudantes: {len(students)}")
                return students
            else:
                logger.warning("Nenhum estudante foi extraído")
                return None
                
        except Exception as e:
            logger.error(f"❌ Erro geral: {str(e)}")
            return None


def main():
    """Função principal"""
    
    USERNAME = os.getenv("SIAGE_USERNAME", "095.297.464-90")
    PASSWORD = os.getenv("SIAGE_PASSWORD", "ned365298")
    OUTPUT_FORMAT = os.getenv("SIAGE_OUTPUT_FORMAT", "csv")
    
    extractor = SiageExtractorFinal(
        username=USERNAME,
        password=PASSWORD
    )
    
    students = extractor.run(output_format=OUTPUT_FORMAT)
    
    if students:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
