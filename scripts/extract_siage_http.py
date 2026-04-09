#!/usr/bin/env python3
"""
Script de Extração de Dados do SIAGE via HTTP
Usa requests + BeautifulSoup para extrair dados sem necessidade de navegador
"""

import os
import sys
import json
import logging
import time
from datetime import datetime
from typing import List, Dict, Optional, Tuple
import requests
from bs4 import BeautifulSoup
import pandas as pd
from urllib.parse import urljoin, parse_qs, urlparse
import re

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('siage_extraction_http.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class SiageHttpExtractor:
    """Classe para extrair dados do SIAGE via HTTP"""
    
    def __init__(self, url: str, username: str, password: str):
        """
        Inicializar o extrator do SIAGE
        
        Args:
            url: URL do SIAGE
            username: Usuário para login
            password: Senha para login
        """
        self.url = url
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.base_url = self._extract_base_url(url)
        
    def _extract_base_url(self, url: str) -> str:
        """Extrair URL base"""
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"
    
    def login(self) -> bool:
        """
        Fazer login no SIAGE
        
        Returns:
            True se login foi bem-sucedido
        """
        try:
            logger.info(f"Acessando {self.url}...")
            
            # Fazer GET inicial para obter cookies
            response = self.session.get(self.url, timeout=30)
            response.raise_for_status()
            
            # Procurar por tokens CSRF ou similares
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Preparar dados de login
            login_data = {
                'usuario': self.username,
                'senha': self.password,
            }
            
            # Procurar por campos adicionais no formulário
            form = soup.find('form')
            if form:
                for input_field in form.find_all('input'):
                    if input_field.get('type') == 'hidden':
                        field_name = input_field.get('name')
                        field_value = input_field.get('value')
                        if field_name and field_value:
                            login_data[field_name] = field_value
                            logger.info(f"  Campo oculto encontrado: {field_name}")
            
            logger.info("Enviando credenciais...")
            
            # Tentar fazer login com GET (alguns sistemas usam GET para login)
            logger.info(f"  Tentando login via GET...")
            try:
                response = self.session.get(self.url, params=login_data, timeout=30, allow_redirects=True)
                response.raise_for_status()
                
                # Verificar se login foi bem-sucedido
                if 'auth' not in response.url or 'dashboard' in response.url or 'meus-estudantes' in response.url or 'escola' in response.url:
                    logger.info(f"✅ Login bem-sucedido! URL atual: {response.url}")
                    return True
            except Exception as e:
                logger.warning(f"  Erro com GET: {str(e)}")
            
            # Se GET não funcionou, tentar POST
            logger.info(f"  Tentando login via POST...")
            try:
                response = self.session.post(self.url, data=login_data, timeout=30, allow_redirects=True)
                response.raise_for_status()
                
                if 'auth' not in response.url or 'dashboard' in response.url or 'meus-estudantes' in response.url or 'escola' in response.url:
                    logger.info(f"✅ Login bem-sucedido! URL atual: {response.url}")
                    return True
            except Exception as e:
                logger.warning(f"  Erro com POST: {str(e)}")
            
            logger.error("❌ Falha no login - não foi possível autenticar")
            return False
            
        except Exception as e:
            logger.error(f"❌ Erro durante login: {str(e)}")
            return False
    
    def navigate_to_students_page(self) -> Optional[str]:
        """
        Navegar para a página de listagem de estudantes
        
        Returns:
            URL da página de estudantes ou None se falhar
        """
        try:
            logger.info("Navegando para página de estudantes...")
            
            # Tentar diferentes URLs possíveis
            possible_urls = [
                urljoin(self.base_url, '/meus-estudantes'),
                urljoin(self.base_url, '/estudantes'),
                urljoin(self.base_url, '/alunos'),
                urljoin(self.base_url, '/dashboard'),
                urljoin(self.base_url, '/'),
            ]
            
            for url in possible_urls:
                try:
                    logger.info(f"  Tentando: {url}")
                    response = self.session.get(url, timeout=30)
                    response.raise_for_status()
                    
                    # Verificar se encontrou a página de estudantes
                    if 'estudante' in response.text.lower() or 'aluno' in response.text.lower():
                        logger.info(f"✅ Página de estudantes encontrada: {url}")
                        return response.text
                except Exception as e:
                    logger.warning(f"  Erro ao acessar {url}: {str(e)}")
                    continue
            
            logger.error("❌ Não foi possível encontrar a página de estudantes")
            return None
            
        except Exception as e:
            logger.error(f"❌ Erro ao navegar: {str(e)}")
            return None
    
    def extract_students_from_html(self, html: str) -> List[Dict]:
        """
        Extrair dados de estudantes do HTML
        
        Args:
            html: Conteúdo HTML da página
        
        Returns:
            Lista de dicionários com dados dos estudantes
        """
        try:
            logger.info("Extraindo dados dos estudantes do HTML...")
            
            soup = BeautifulSoup(html, 'html.parser')
            students = []
            
            # Procurar por tabelas
            tables = soup.find_all('table')
            logger.info(f"Encontradas {len(tables)} tabelas")
            
            for table_idx, table in enumerate(tables):
                logger.info(f"  Processando tabela {table_idx + 1}...")
                
                # Encontrar todas as linhas
                rows = table.find_all('tr')
                logger.info(f"    Encontradas {len(rows)} linhas")
                
                for row_idx, row in enumerate(rows):
                    try:
                        # Pular header
                        if row_idx == 0:
                            continue
                        
                        cells = row.find_all('td')
                        
                        if len(cells) >= 7:
                            # Extrair dados
                            student = {
                                'turma': cells[0].get_text(strip=True),
                                'nome_civil': cells[1].get_text(strip=True),
                                'nome_social': cells[2].get_text(strip=True),
                                'data_nascimento': cells[3].get_text(strip=True),
                                'cpf': cells[4].get_text(strip=True),
                                'filiacao_mae': cells[5].get_text(strip=True),
                                'filiacao_pai': cells[6].get_text(strip=True) if len(cells) > 6 else '-',
                            }
                            
                            # Normalizar dados vazios
                            for key in student:
                                value = student[key]
                                if value == '-' or value == '' or value.lower() == 'none':
                                    student[key] = None
                            
                            # Validar dados
                            if student['nome_civil']:
                                students.append(student)
                                logger.info(f"    [{row_idx}] {student['nome_civil']} - Turma: {student['turma']}")
                    
                    except Exception as e:
                        logger.warning(f"    Erro ao processar linha {row_idx}: {str(e)}")
                        continue
            
            logger.info(f"✅ {len(students)} estudantes extraídos")
            return students
            
        except Exception as e:
            logger.error(f"❌ Erro ao extrair dados: {str(e)}")
            return []
    
    def search_students(self, turma: Optional[str] = None, cpf: Optional[str] = None) -> Optional[str]:
        """
        Executar busca de estudantes com filtros
        
        Args:
            turma: Filtro de turma (opcional)
            cpf: Filtro de CPF (opcional)
        
        Returns:
            HTML da página de resultados ou None se falhar
        """
        try:
            logger.info("Executando busca de estudantes...")
            
            # Preparar parâmetros de busca
            search_params = {}
            
            if turma:
                search_params['turma'] = turma
                logger.info(f"  Filtro turma: {turma}")
            
            if cpf:
                search_params['cpf'] = cpf
                logger.info(f"  Filtro CPF: {cpf}")
            
            # Tentar diferentes endpoints de busca
            search_endpoints = [
                urljoin(self.base_url, '/meus-estudantes/buscar'),
                urljoin(self.base_url, '/estudantes/buscar'),
                urljoin(self.base_url, '/api/estudantes'),
            ]
            
            for endpoint in search_endpoints:
                try:
                    logger.info(f"  Tentando endpoint: {endpoint}")
                    response = self.session.get(endpoint, params=search_params, timeout=30)
                    response.raise_for_status()
                    
                    if response.status_code == 200:
                        logger.info(f"✅ Busca executada com sucesso")
                        return response.text
                except Exception as e:
                    logger.warning(f"  Erro com endpoint {endpoint}: {str(e)}")
                    continue
            
            logger.warning("Não foi possível executar busca, retornando página atual")
            return None
            
        except Exception as e:
            logger.error(f"❌ Erro ao buscar: {str(e)}")
            return None
    
    def save_to_csv(self, students: List[Dict], filename: str = "estudantes.csv") -> bool:
        """Salvar dados em CSV"""
        try:
            logger.info(f"Salvando dados em {filename}...")
            df = pd.DataFrame(students)
            df.to_csv(filename, index=False, encoding='utf-8')
            logger.info(f"✅ Arquivo salvo: {filename}")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao salvar CSV: {str(e)}")
            return False
    
    def save_to_json(self, students: List[Dict], filename: str = "estudantes.json") -> bool:
        """Salvar dados em JSON"""
        try:
            logger.info(f"Salvando dados em {filename}...")
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(students, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Arquivo salvo: {filename}")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao salvar JSON: {str(e)}")
            return False
    
    def save_to_excel(self, students: List[Dict], filename: str = "estudantes.xlsx") -> bool:
        """Salvar dados em Excel"""
        try:
            logger.info(f"Salvando dados em {filename}...")
            df = pd.DataFrame(students)
            df.to_excel(filename, index=False, sheet_name='Estudantes')
            logger.info(f"✅ Arquivo salvo: {filename}")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao salvar Excel: {str(e)}")
            return False
    
    def run(self, output_format: str = "csv", turma: Optional[str] = None, cpf: Optional[str] = None) -> Optional[List[Dict]]:
        """
        Executar o processo completo de extração
        
        Args:
            output_format: Formato de saída ('csv', 'json', 'excel')
            turma: Filtro de turma (opcional)
            cpf: Filtro de CPF (opcional)
        
        Returns:
            Lista de estudantes extraídos
        """
        try:
            if not self.login():
                logger.error("Falha no login")
                return None
            
            html = self.navigate_to_students_page()
            if not html:
                logger.error("Falha ao navegar para página de estudantes")
                return None
            
            # Tentar busca se filtros foram especificados
            if turma or cpf:
                search_html = self.search_students(turma=turma, cpf=cpf)
                if search_html:
                    html = search_html
            
            students = self.extract_students_from_html(html)
            
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
                
                logger.info(f"✅ Extração concluída com sucesso!")
                return students
            else:
                logger.warning("Nenhum estudante foi extraído")
                return None
                
        except Exception as e:
            logger.error(f"❌ Erro geral: {str(e)}")
            return None


def main():
    """Função principal"""
    
    SIAGE_URL = os.getenv("SIAGE_URL", "https://escola.see.pb.gov.br/auth")
    USERNAME = os.getenv("SIAGE_USERNAME", "095.297.464-90")
    PASSWORD = os.getenv("SIAGE_PASSWORD", "ned365298")
    OUTPUT_FORMAT = os.getenv("SIAGE_OUTPUT_FORMAT", "csv")
    
    logger.info("=" * 60)
    logger.info("SIAGE HTTP Data Extractor")
    logger.info("=" * 60)
    logger.info(f"URL: {SIAGE_URL}")
    logger.info(f"Usuário: {USERNAME}")
    logger.info(f"Formato de saída: {OUTPUT_FORMAT}")
    logger.info("=" * 60)
    
    extractor = SiageHttpExtractor(
        url=SIAGE_URL,
        username=USERNAME,
        password=PASSWORD
    )
    
    students = extractor.run(output_format=OUTPUT_FORMAT)
    
    if students:
        logger.info(f"✅ Total de estudantes extraídos: {len(students)}")
        sys.exit(0)
    else:
        logger.error("❌ Falha na extração")
        sys.exit(1)


if __name__ == "__main__":
    main()
