#!/bin/bash

echo "🚀 Scrum Maturity Dashboard - Git Setup"
echo "========================================"
echo ""

# Verificar se já é um repositório git
if [ -d .git ]; then
    echo "⚠️  Este já é um repositório Git."
    echo ""
    read -p "Deseja fazer commit e push das mudanças? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "Update: Scrum Maturity Dashboard"
        git push
        echo "✅ Mudanças enviadas!"
    fi
    exit 0
fi

# Inicializar Git
echo "📦 Inicializando repositório Git..."
git init
echo "✅ Git inicializado!"
echo ""

# Solicitar URL do repositório
echo "📝 Agora você precisa da URL do seu repositório GitHub."
echo "   Exemplo: https://github.com/seu-usuario/scrum-maturity-dashboard.git"
echo ""
read -p "Cole a URL do repositório: " repo_url

# Validar URL
if [ -z "$repo_url" ]; then
    echo "❌ URL não pode estar vazia!"
    exit 1
fi

# Adicionar remote
echo ""
echo "🔗 Conectando ao repositório remoto..."
git remote add origin "$repo_url"
echo "✅ Repositório conectado!"

# Fazer primeiro commit
echo ""
echo "📝 Criando primeiro commit..."
git add .
git commit -m "Initial commit: Scrum Maturity Dashboard"
echo "✅ Commit criado!"

# Push para GitHub
echo ""
echo "⬆️  Enviando código para GitHub..."
git branch -M main
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Sucesso! Código enviado para GitHub!"
    echo ""
    echo "🎯 Próximos passos:"
    echo "   1. Acesse https://render.com"
    echo "   2. Crie um Web Service"
    echo "   3. Conecte seu repositório GitHub"
    echo "   4. Siga as instruções em DEPLOY.md"
    echo ""
else
    echo ""
    echo "❌ Erro ao enviar código."
    echo "   Verifique suas credenciais do GitHub e tente novamente."
    echo ""
fi
