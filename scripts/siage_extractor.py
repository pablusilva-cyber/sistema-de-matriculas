#!/usr/bin/env python3
"""
Script para extrair dados de alunos do SIAGE automaticamente
e gerar arquivo CSV para importação no sistema de matrícula
"""

import requests
import json
import csv
from datetime import datetime
from bs4 import BeautifulSoup
import re

class SIAGEExtractor:
    def __init__(self, username, password):
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.base_url = "https://escola.see.pb.gov.br"
        self.students = []
        
    def login(self):
        """Fazer login no SIAGE"""
        print("🔐 Fazendo login no SIAGE...")
        
        # Acessar página de login
        login_url = f"{self.base_url}/auth"
        response = self.session.get(login_url)
        
        # Fazer login com credenciais
        login_data = {
            'usuario': self.username,
            'senha': self.password
        }
        
        response = self.session.get(
            f"{self.base_url}/auth",
            params=login_data,
            allow_redirects=True
        )
        
        # Verificar se login foi bem-sucedido
        if 'selecionar-ano-letivo' in response.url or 'painel-turmas' in response.url:
            print("✅ Login realizado com sucesso!")
            return True
        else:
            print("❌ Erro ao fazer login")
            return False
    
    def select_school_year(self):
        """Selecionar ano letivo"""
        print("📅 Selecionando ano letivo...")
        
        # Acessar página de seleção de ano letivo
        year_url = f"{self.base_url}/auth/selecionar-ano-letivo"
        response = self.session.get(year_url)
        
        # Fazer POST para selecionar o ano letivo
        response = self.session.post(year_url, data={})
        
        if response.status_code == 200:
            print("✅ Ano letivo selecionado!")
            return True
        else:
            print("❌ Erro ao selecionar ano letivo")
            return False
    
    def extract_students(self):
        """Extrair dados dos alunos"""
        print("📊 Extraindo dados dos alunos...")
        
        # Acessar página de relação de estudantes
        students_url = f"{self.base_url}/meus-estudantes/relacao-estudantes"
        response = self.session.get(students_url)
        
        if response.status_code != 200:
            print(f"❌ Erro ao acessar página de alunos (Status: {response.status_code})")
            return False
        
        # Parsear HTML
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Encontrar tabela de alunos
        table = soup.find('table')
        if not table:
            print("❌ Tabela de alunos não encontrada")
            return False
        
        # Extrair linhas da tabela
        rows = table.find_all('tr')[1:]  # Pular header
        
        print(f"📝 Encontrados {len(rows)} alunos")
        
        for idx, row in enumerate(rows, 1):
            cells = row.find_all('td')
            if len(cells) >= 8:
                student = {
                    'serie': cells[0].text.strip(),
                    'turma': cells[1].text.strip(),
                    'nome_civil': cells[2].text.strip(),
                    'nome_social': cells[3].text.strip(),
                    'data_nascimento': cells[4].text.strip(),
                    'cpf': cells[5].text.strip(),
                    'filacao_mae': cells[6].text.strip(),
                    'filacao_pai': cells[7].text.strip()
                }
                self.students.append(student)
                
                if idx % 50 == 0:
                    print(f"  ✓ Processados {idx} alunos...")
        
        print(f"✅ Total de {len(self.students)} alunos extraídos!")
        return True
    
    def save_to_csv(self, filename=None):
        """Salvar dados em arquivo CSV"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"estudantes_siage_{timestamp}.csv"
        
        print(f"💾 Salvando dados em {filename}...")
        
        if not self.students:
            print("❌ Nenhum dado para salvar")
            return False
        
        try:
            with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = [
                    'serie',
                    'turma',
                    'nome_civil',
                    'nome_social',
                    'data_nascimento',
                    'cpf',
                    'filacao_mae',
                    'filacao_pai'
                ]
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                writer.writeheader()
                writer.writerows(self.students)
            
            print(f"✅ Arquivo salvo com sucesso: {filename}")
            return True
        except Exception as e:
            print(f"❌ Erro ao salvar arquivo: {e}")
            return False
    
    def save_to_json(self, filename=None):
        """Salvar dados em arquivo JSON"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"estudantes_siage_{timestamp}.json"
        
        print(f"💾 Salvando dados em {filename}...")
        
        if not self.students:
            print("❌ Nenhum dado para salvar")
            return False
        
        try:
            with open(filename, 'w', encoding='utf-8') as jsonfile:
                json.dump(self.students, jsonfile, ensure_ascii=False, indent=2)
            
            print(f"✅ Arquivo salvo com sucesso: {filename}")
            return True
        except Exception as e:
            print(f"❌ Erro ao salvar arquivo: {e}")
            return False
    
    def run(self, output_format='csv'):
        """Executar extração completa"""
        print("\n" + "="*50)
        print("🚀 EXTRATOR DE DADOS DO SIAGE")
        print("="*50 + "\n")
        
        if not self.login():
            return False
        
        if not self.select_school_year():
            return False
        
        if not self.extract_students():
            return False
        
        if output_format == 'csv':
            return self.save_to_csv()
        elif output_format == 'json':
            return self.save_to_json()
        else:
            print(f"❌ Formato desconhecido: {output_format}")
            return False


if __name__ == "__main__":
    import sys
    
    # Credenciais
    username = "095.297.464-90"
    password = "ned365298"
    
    # Formato de saída (csv ou json)
    output_format = sys.argv[1] if len(sys.argv) > 1 else 'csv'
    
    # Criar extrator e executar
    extrator = SIAGEExtractor(username, password)
    success = extrator.run(output_format)
    
    sys.exit(0 if success else 1)
