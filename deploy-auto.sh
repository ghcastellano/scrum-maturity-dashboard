#!/bin/bash

echo "🚀 Scrum Maturity Dashboard - Deploy Automático"
echo "================================================"
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se está na pasta correta
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Erro: Execute este script na raiz do projeto scrum-maturity-dashboard${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Pré-requisitos:${NC}"
echo "   - Conta no Vercel criada"
echo "   - Conta no Render criada"
echo "   - GitHub configurado"
echo ""

read -p "Pressione ENTER para continuar..." 

# Verificar Git
echo ""
echo -e "${YELLOW}🔍 Verificando Git...${NC}"
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git não instalado. Instale: https://git-scm.com${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Git OK${NC}"

# Verificar Node
echo -e "${YELLOW}🔍 Verificando Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não instalado. Instale: https://nodejs.org${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js OK ($(node -v))${NC}"

# Verificar Vercel CLI
echo -e "${YELLOW}🔍 Verificando Vercel CLI...${NC}"
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}⚠️  Vercel CLI não instalado. Instalando...${NC}"
    npm install -g vercel
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Erro ao instalar Vercel CLI${NC}"
        echo "   Tente manualmente: npm install -g vercel"
        exit 1
    fi
fi
echo -e "${GREEN}✅ Vercel CLI OK${NC}"

echo ""
echo "================================================"
echo -e "${GREEN}🎯 PASSO 1: Setup GitHub${NC}"
echo "================================================"
echo ""

# Verificar se já é um repo git
if [ ! -d .git ]; then
    echo -e "${YELLOW}📦 Inicializando Git...${NC}"
    git init
    git add .
    git commit -m "Initial commit: Scrum Maturity Dashboard"
    git branch -M main
    echo -e "${GREEN}✅ Git inicializado!${NC}"
    echo ""
    echo -e "${YELLOW}📝 Agora você precisa:${NC}"
    echo "   1. Criar repositório no GitHub: https://github.com/new"
    echo "   2. Copiar a URL do repositório"
    echo ""
    read -p "Cole a URL do repositório GitHub: " github_url
    
    if [ -z "$github_url" ]; then
        echo -e "${RED}❌ URL não pode estar vazia${NC}"
        exit 1
    fi
    
    git remote add origin "$github_url"
    echo ""
    echo -e "${YELLOW}⬆️  Enviando código para GitHub...${NC}"
    git push -u origin main
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Código enviado com sucesso!${NC}"
    else
        echo -e "${RED}❌ Erro ao enviar código. Verifique suas credenciais.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Git já configurado${NC}"
fi

echo ""
echo "================================================"
echo -e "${GREEN}🎯 PASSO 2: Deploy Frontend (Vercel)${NC}"
echo "================================================"
echo ""

echo -e "${YELLOW}📝 Você será solicitado a fazer login no Vercel...${NC}"
echo ""
read -p "Pressione ENTER para continuar com deploy no Vercel..."

cd client

# Login no Vercel (abre navegador)
vercel login

echo ""
echo -e "${YELLOW}🚀 Fazendo deploy no Vercel...${NC}"
echo ""

# Deploy
vercel --prod

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Frontend deployado com sucesso no Vercel!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Anote a URL do Vercel que apareceu acima${NC}"
    read -p "Cole a URL do Vercel (ex: https://seu-projeto.vercel.app): " vercel_url
else
    echo -e "${RED}❌ Erro no deploy do Vercel${NC}"
    cd ..
    exit 1
fi

cd ..

echo ""
echo "================================================"
echo -e "${GREEN}🎯 PASSO 3: Deploy Backend (Render)${NC}"
echo "================================================"
echo ""

echo -e "${YELLOW}⚠️  O backend precisa ser deployado manualmente no Render:${NC}"
echo ""
echo "1. Acesse: https://render.com"
echo "2. New + → Web Service"
echo "3. Conecte seu repositório GitHub"
echo "4. Configure:"
echo "   - Name: scrum-maturity-api"
echo "   - Build Command: cd server && npm install"
echo "   - Start Command: cd server && npm start"
echo "   - Environment Variables:"
echo "     • NODE_ENV = production"
echo "     • PORT = 10000"
echo ""
read -p "Após deploy no Render, cole a URL (ex: https://seu-api.onrender.com): " render_url

echo ""
echo "================================================"
echo -e "${GREEN}🎯 PASSO 4: Conectar Frontend ao Backend${NC}"
echo "================================================"
echo ""

api_url="${render_url}/api"

echo -e "${YELLOW}🔗 Configurando variável de ambiente no Vercel...${NC}"
echo ""
echo "Execute este comando:"
echo ""
echo -e "${GREEN}vercel env add VITE_API_URL production${NC}"
echo ""
echo "Quando solicitado, cole este valor: ${api_url}"
echo ""
read -p "Pressione ENTER após executar o comando acima..."

echo ""
echo -e "${YELLOW}🔄 Fazendo redeploy com nova variável...${NC}"
cd client
vercel --prod
cd ..

echo ""
echo "================================================"
echo -e "${GREEN}🎉 DEPLOY CONCLUÍDO!${NC}"
echo "================================================"
echo ""
echo -e "${GREEN}✅ Suas URLs:${NC}"
echo ""
echo "   🌐 Frontend (Compartilhe este): ${vercel_url}"
echo "   🔌 Backend: ${render_url}"
echo ""
echo -e "${YELLOW}📝 Próximos passos:${NC}"
echo "   1. Teste acessando: ${vercel_url}"
echo "   2. Conecte com suas credenciais Jira"
echo "   3. Compartilhe o link com seu time!"
echo ""
echo -e "${GREEN}🎯 Link para compartilhar:${NC} ${vercel_url}"
echo ""
