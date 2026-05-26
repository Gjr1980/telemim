# Evolution API - Instalação no Oracle Cloud (Free Tier)

## PASSO 1: Criar Conta Oracle Cloud

1. Acesse: https://cloud.oracle.com
2. Clique "Sign Up" (Criar conta gratuita)
3. Preencha com seus dados reais (nome, email, país: Brazil)
4. Cartão de crédito é pedido mas NÃO será cobrado (free tier)
5. Após verificação, acesse o painel (Console)

---

## PASSO 2: Criar a VM (Máquina Virtual)

1. No Console Oracle, clique em **"Create a VM instance"**
2. Configure:
   - **Name**: `evolution-api`
   - **Image**: Ubuntu 22.04 (Canonical)
   - **Shape**: Ampere A1 Flex (ARM) — **GRÁTIS**
     - OCPUs: 1 (pode usar até 4 grátis)
     - Memory: 6 GB (pode usar até 24 grátis)
   - **Networking**: Criar nova VCN (rede virtual)
     - Marcar "Assign a public IPv4 address"
   - **SSH Key**: Clique "Generate a key pair"
     - **BAIXE a chave privada** (.key) — guarde bem!
     - Baixe também a chave pública
3. Clique **"Create"**
4. Aguarde o status mudar para **RUNNING**
5. Anote o **IP Público** (ex: 152.xx.xx.xx)

---

## PASSO 3: Abrir Portas no Firewall Oracle

### No Console Oracle:
1. Vá em **Networking > Virtual Cloud Networks**
2. Clique na VCN da sua VM
3. Clique na **Subnet** > **Security List** (Default)
4. Clique **"Add Ingress Rules"**:

| Source CIDR | Protocol | Dest Port | Descrição |
|-------------|----------|-----------|-----------|
| 0.0.0.0/0 | TCP | 8080 | Evolution API |
| 0.0.0.0/0 | TCP | 8443 | Evolution (HTTPS) |

5. Salve

---

## PASSO 4: Conectar na VM via SSH

No Terminal do Mac:

```bash
# Mover a chave para ~/.ssh
mv ~/Downloads/ssh-key-*.key ~/.ssh/oracle-evolution.key
chmod 600 ~/.ssh/oracle-evolution.key

# Conectar (substitua pelo IP da sua VM)
ssh -i ~/.ssh/oracle-evolution.key ubuntu@SEU_IP_AQUI
```

---

## PASSO 5: Instalar Docker na VM

Após conectar via SSH, execute:

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sudo sh

# Adicionar usuário ao grupo docker
sudo usermod -aG docker ubuntu

# Sair e reconectar para aplicar permissão
exit
```

Reconecte via SSH e teste:
```bash
docker --version
```

---

## PASSO 6: Instalar Evolution API

```bash
# Criar pasta
mkdir ~/evolution && cd ~/evolution

# Criar docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.3'

services:
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - AUTHENTICATION_API_KEY=TROCAR_POR_CHAVE_SEGURA_AQUI
      - AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
      - SERVER_URL=http://SEU_IP_AQUI:8080
      - DEL_INSTANCE=false
      - STORE_MESSAGES=true
      - STORE_MESSAGE_UP=true
      - STORE_CONTACTS=true
      - STORE_CHATS=true
      - DATABASE_ENABLED=false
      - REDIS_ENABLED=false
      - RABBITMQ_ENABLED=false
      - WEBSOCKET_ENABLED=false
    volumes:
      - evolution_store:/evolution/store

volumes:
  evolution_store:
EOF
```

**IMPORTANTE**: Edite o arquivo e substitua:
- `TROCAR_POR_CHAVE_SEGURA_AQUI` → uma senha forte (ex: `TeL3m1m_2026_Ev0`)
- `SEU_IP_AQUI` → o IP público da sua VM Oracle

```bash
# Editar (substitua os valores)
nano docker-compose.yml

# Subir o container
docker compose up -d

# Verificar se está rodando
docker ps
```

Deve aparecer o container `evolution-api` com status "Up".

---

## PASSO 7: Criar Instância e Conectar WhatsApp

### Criar instância:
```bash
curl -X POST http://SEU_IP_AQUI:8080/instance/create \
  -H "apikey: SUA_API_KEY_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "telemim",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

### Obter QR Code:
```bash
curl -X GET http://SEU_IP_AQUI:8080/instance/connect/telemim \
  -H "apikey: SUA_API_KEY_AQUI"
```

Isso retorna um QR Code em base64. Abra no navegador:
```
http://SEU_IP_AQUI:8080/manager
```

Ou acesse o painel web e escaneie o QR Code com o WhatsApp do número que vai enviar.

---

## PASSO 8: Configurar no App TELEMIM

No app (Configurações > WhatsApp):

| Campo | Valor |
|-------|-------|
| URL da API | `http://SEU_IP_AQUI:8080` |
| API Key | A chave que você definiu no docker-compose |
| Nome da Instância | `telemim` |
| Telefone Admin | Seu número (ex: 81999990000) |
| Telefone Supervisor | Número do supervisor |

Ative o toggle "WhatsApp Automático" e salve.

---

## PASSO 9: Testar envio

Após eu criar a Edge Function `enviar-whatsapp`, o fluxo será:

1. Motorista finaliza mudança + cliente assina
2. App gera PDF do canhoto
3. Chama Edge Function com PDF + dados
4. Edge Function envia via Evolution API para:
   - Cliente (PDF + mensagem)
   - Admin (notificação)
   - Supervisor (notificação)

---

## Abrir Firewall Linux (dentro da VM)

Se a porta 8080 não responder mesmo após configurar no Oracle Console:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save
```

---

## Comandos Úteis

```bash
# Ver logs
docker logs evolution-api -f

# Reiniciar
docker compose restart

# Atualizar Evolution API
docker compose pull && docker compose up -d

# Status da instância
curl http://SEU_IP_AQUI:8080/instance/connectionState/telemim \
  -H "apikey: SUA_API_KEY_AQUI"
```

---

## Resumo dos Dados que Você Vai Precisar Anotar:

- [ ] IP Público da VM Oracle: _______________
- [ ] API Key (definida no docker-compose): _______________
- [ ] Nome da instância: `telemim`
- [ ] Número WhatsApp conectado: _______________
