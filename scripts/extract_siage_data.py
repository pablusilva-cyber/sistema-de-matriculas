#!/usr/bin/env python3
"""
Script de Extração de Dados do SIAGE
Automatiza o login e extração de dados de alunos do sistema SIAGE
"""

import os
import sys
import json
import time
import logging
from datetime import datetime
from typing import List, Dict, Optional
import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('siage_extraction.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class SiageExtractor:
    """Classe para extrair dados do SIAGE"""
    
    def __init__(self, url: str, username: str, password: str, headless: bool = False):
        """
        Inicializar o extrator do SIAGE
        
        Args:
            url: URL do SIAGE
            username: Usuário para login
            password: Senha para login
            headless: Se True, executa sem interface gráfica
        """
        self.url = url
        self.username = username
        self.password = password
        self.headless = headless
        self.driver = None
        self.wait = None
        
    def setup_driver(self):
        """Configurar o driver do Selenium"""
        logger.info("Configurando o driver do Chrome...")
        
        chrome_options = Options()
        
        if self.headless:
            chrome_options.add_argument("--headless")
        
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        
        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=chrome_options)
        self.wait = WebDriverWait(self.driver, 20)
        
        logger.info("✅ Driver configurado com sucesso")
    
    def login(self) -> bool:
        """
        Fazer login no SIAGE
        
        Returns:
            True se login foi bem-sucedido, False caso contrário
        """
        try:
            logger.info(f"Acessando {self.url}...")
            self.driver.get(self.url)
            time.sleep(3)
            
            # Preencher usuário
            logger.info("Preenchendo usuário...")
            username_field = self.wait.until(
                EC.presence_of_element_located((By.ID, "usuario"))
            )
            username_field.clear()
            username_field.send_keys(self.username)
            time.sleep(1)
            
            # Preencher senha
            logger.info("Preenchendo senha...")
            password_field = self.driver.find_element(By.ID, "senha")
            password_field.clear()
            password_field.send_keys(self.password)
            time.sleep(1)
            
            # Clicar em ACESSAR
            logger.info("Clicando em ACESSAR...")
            login_button = self.driver.find_element(By.XPATH, "//button[contains(text(), 'ACESSAR')]")
            login_button.click()
            
            # Aguardar redirecionamento
            time.sleep(5)
            
            # Verificar se login foi bem-sucedido
            if "auth" not in self.driver.current_url:
                logger.info("✅ Login bem-sucedido!")
                return True
            else:
                logger.error("❌ Falha no login - ainda na página de autenticação")
                return False
                
        except Exception as e:
            logger.error(f"❌ Erro durante login: {str(e)}")
            return False
    
    def navigate_to_students(self) -> bool:
        """
        Navegar para a página de listagem de estudantes
        
        Returns:
            True se navegação foi bem-sucedida
        """
        try:
            logger.info("Navegando para 'Meus Estudantes'...")
            
            # Aguardar e clicar em "Meus Estudantes"
            students_menu = self.wait.until(
                EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'Meus Estudantes')]"))
            )
            students_menu.click()
            time.sleep(3)
            
            # Aguardar e clicar em "Listar Estudantes"
            logger.info("Clicando em 'Listar Estudantes'...")
            list_students = self.wait.until(
                EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'Listar Estudantes')]"))
            )
            list_students.click()
            time.sleep(5)
            
            logger.info("✅ Navegação bem-sucedida")
            return True
            
        except Exception as e:
            logger.error(f"❌ Erro ao navegar: {str(e)}")
            return False
    
    def search_students(self, turma: Optional[str] = None, cpf: Optional[str] = None) -> bool:
        """
        Executar busca de estudantes com filtros opcionais
        
        Args:
            turma: Filtrar por turma (opcional)
            cpf: Filtrar por CPF (opcional)
        
        Returns:
            True se busca foi bem-sucedida
        """
        try:
            logger.info("Executando busca de estudantes...")
            
            # Se turma foi especificada, selecionar
            if turma:
                logger.info(f"Filtrando por turma: {turma}")
                turma_select = Select(self.driver.find_element(By.ID, "turma"))
                turma_select.select_by_value(turma)
                time.sleep(2)
            
            # Se CPF foi especificado, preencher
            if cpf:
                logger.info(f"Filtrando por CPF: {cpf}")
                cpf_field = self.driver.find_element(By.ID, "cpf")
                cpf_field.clear()
                cpf_field.send_keys(cpf)
                time.sleep(2)
            
            # Clicar em "Buscar"
            logger.info("Clicando em 'Buscar'...")
            search_button = self.driver.find_element(By.XPATH, "//button[contains(text(), 'Buscar')]")
            search_button.click()
            time.sleep(5)
            
            logger.info("✅ Busca executada")
            return True
            
        except Exception as e:
            logger.error(f"❌ Erro ao buscar: {str(e)}")
            return False
    
    def extract_students_data(self) -> List[Dict]:
        """
        Extrair dados dos estudantes da tabela
        
        Returns:
            Lista de dicionários com dados dos estudantes
        """
        try:
            logger.info("Extraindo dados dos estudantes...")
            
            students = []
            
            # Aguardar a tabela aparecer
            self.wait.until(
                EC.presence_of_element_located((By.XPATH, "//table//tbody//tr"))
            )
            
            # Encontrar todas as linhas da tabela
            rows = self.driver.find_elements(By.XPATH, "//table//tbody//tr")
            logger.info(f"Encontrados {len(rows)} estudantes")
            
            for idx, row in enumerate(rows, 1):
                try:
                    # Extrair células da linha
                    cells = row.find_elements(By.TAG_NAME, "td")
                    
                    if len(cells) >= 7:
                        student = {
                            'turma': cells[0].text.strip(),
                            'nome_civil': cells[1].text.strip(),
                            'nome_social': cells[2].text.strip(),
                            'data_nascimento': cells[3].text.strip(),
                            'cpf': cells[4].text.strip(),
                            'filiacao_mae': cells[5].text.strip(),
                            'filiacao_pai': cells[6].text.strip() if len(cells) > 6 else '-',
                        }
                        
                        # Normalizar dados vazios
                        for key in student:
                            if student[key] == '-' or student[key] == '':
                                student[key] = None
                        
                        students.append(student)
                        logger.info(f"  [{idx}] {student['nome_civil']} - Turma: {student['turma']}")
                        
                except Exception as e:
                    logger.warning(f"  Erro ao extrair linha {idx}: {str(e)}")
                    continue
            
            logger.info(f"✅ {len(students)} estudantes extraídos com sucesso")
            return students
            
        except Exception as e:
            logger.error(f"❌ Erro ao extrair dados: {str(e)}")
            return []
    
    def save_to_csv(self, students: List[Dict], filename: str = "estudantes.csv") -> bool:
        """
        Salvar dados em arquivo CSV
        
        Args:
            students: Lista de estudantes
            filename: Nome do arquivo de saída
        
        Returns:
            True se arquivo foi salvo com sucesso
        """
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
        """
        Salvar dados em arquivo JSON
        
        Args:
            students: Lista de estudantes
            filename: Nome do arquivo de saída
        
        Returns:
            True se arquivo foi salvo com sucesso
        """
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
        """
        Salvar dados em arquivo Excel
        
        Args:
            students: Lista de estudantes
            filename: Nome do arquivo de saída
        
        Returns:
            True se arquivo foi salvo com sucesso
        """
        try:
            logger.info(f"Salvando dados em {filename}...")
            
            df = pd.DataFrame(students)
            df.to_excel(filename, index=False, sheet_name='Estudantes')
            
            logger.info(f"✅ Arquivo salvo: {filename}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Erro ao salvar Excel: {str(e)}")
            return False
    
    def close(self):
        """Fechar o driver"""
        if self.driver:
            self.driver.quit()
            logger.info("Driver fechado")
    
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
            self.setup_driver()
            
            if not self.login():
                logger.error("Falha no login")
                return None
            
            if not self.navigate_to_students():
                logger.error("Falha na navegação")
                return None
            
            if not self.search_students(turma=turma, cpf=cpf):
                logger.error("Falha na busca")
                return None
            
            students = self.extract_students_data()
            
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
        finally:
            self.close()


def main():
    """Função principal"""
    
    # Configurações
    SIAGE_URL = "https://escola.see.pb.gov.br/auth"
    USERNAME = os.getenv("SIAGE_USERNAME", "095.297.464-90")
    PASSWORD = os.getenv("SIAGE_PASSWORD", "ned365298")
    OUTPUT_FORMAT = os.getenv("SIAGE_OUTPUT_FORMAT", "csv")
    HEADLESS = os.getenv("SIAGE_HEADLESS", "False").lower() == "true"
    
    logger.info("=" * 60)
    logger.info("SIAGE Data Extractor")
    logger.info("=" * 60)
    logger.info(f"URL: {SIAGE_URL}")
    logger.info(f"Usuário: {USERNAME}")
    logger.info(f"Formato de saída: {OUTPUT_FORMAT}")
    logger.info(f"Modo headless: {HEADLESS}")
    logger.info("=" * 60)
    
    # Criar extrator
    extractor = SiageExtractor(
        url=SIAGE_URL,
        username=USERNAME,
        password=PASSWORD,
        headless=HEADLESS
    )
    
    # Executar extração
    students = extractor.run(output_format=OUTPUT_FORMAT)
    
    if students:
        logger.info(f"✅ Total de estudantes extraídos: {len(students)}")
        sys.exit(0)
    else:
        logger.error("❌ Falha na extração")
        sys.exit(1)


if __name__ == "__main__":
    main()
