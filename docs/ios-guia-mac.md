# Guia: compilar o app iOS no Mac e testar no iPhone

Para: dono do projeto, no Mac, com Apple ID gratuito (sem conta paga). Tempo: ~1 h na primeira vez.

## 1. Preparar o Mac (uma vez)

1. **Xcode 26 ou mais novo** (o 27 da App Store serve). Versão mais antiga não compila: o código usa uma opção de Bluetooth que só existe a partir do SDK do iOS 26. Abra o Xcode uma vez, aceite a licença e deixe instalar os componentes do iOS que ele pedir.
   - Se o Mac não aceitar o Xcode da App Store (macOS antigo), baixe o Xcode 26 em <https://developer.apple.com/download/all/> (entra com o Apple ID gratuito; arquivo `.xip`).
2. Terminal:
   ```bash
   xcode-select --install          # Command Line Tools (se pedir)
   node -v                         # precisa ser 20 ou mais; senão instale em nodejs.org
   sudo gem install cocoapods      # ou: brew install cocoapods
   ```
3. No iPhone: **Ajustes → Privacidade e Segurança → Modo de Desenvolvedor → ligar** (o iPhone reinicia). Se a opção não aparecer, ela surge depois do passo 4.3.

## 2. Baixar e compilar

```bash
git clone -b ac24/ptbr-branding https://github.com/alviana/intercom-frontend.git
cd intercom-frontend
npm ci
VITE_BACKEND_URL=https://intercom.ac24horas.com/manager npm run ios:build
cd ios/App && pod install && cd ../..
open ios/App/App.xcworkspace
```

Abra sempre o **.xcworkspace** (não o .xcodeproj).

## 3. Assinatura (Personal Team)

1. Xcode → **Settings → Accounts → +** → entre com seu Apple ID.
2. No projeto, alvo **App** → aba **Signing & Capabilities** → marque *Automatically manage signing* → **Team = (seu nome) (Personal Team)**.
3. Faça o mesmo no alvo **IntercomLiveActivityExtension**.
4. Se o Xcode reclamar do bundle id (já em uso), troque os dois com o mesmo sufixo, ex.: `br.com.ac24horas.intercom.teste` e `br.com.ac24horas.intercom.teste.LiveActivityExtension`.
5. Se a extensão não assinar de jeito nenhum: alvo **App → Build Phases → Embed App Extensions** → remova `IntercomLiveActivityExtension.appex`. (Perde-se só a Live Activity da tela bloqueada.)

## 4. Rodar no iPhone

1. iPhone no cabo, desbloqueado, "Confiar neste computador".
2. No topo do Xcode escolha o iPhone como destino → **▶ (Run)**.
3. Na primeira vez o iPhone recusa abrir: **Ajustes → Geral → VPN e Gerenciamento de Dispositivos → (seu Apple ID) → Confiar**. Rode de novo.
4. O app expira em **7 dias**: para renovar, conecte e dê ▶ de novo.

**Se der erro de compilação:** copie a mensagem inteira (painel *Issue Navigator*, ícone de triângulo) com o nome do arquivo e a linha, e mande para mim. Eu corrijo, você faz `git pull` e roda ▶ de novo.

## 5. Antes de testar

- No app: **Configurações → Saída de áudio → escolha o fone** (AirPods/Bluetooth ou com fio). O app começa no alto-falante; sem isso o botão do fone não chega. Confira na Central de Controle que o áudio está saindo pelo fone.
- Deixe o PC numa linha para ouvir/falar com o iPhone.
- **Configurações → Teste do botão do fone** mostra cada aperto que chegou e o que o app fez.

## 6. Testes — anote o resultado de cada linha

| # | Teste | Resultado |
|---|---|---|
| 1 | Entrar numa linha: ouve o PC e o PC ouve (app aberto). Aparece a "chamada" verde/Dynamic Island "Intercom ac24horas"? | |
| 2 | Mic aberto, **bloquear 10 min**: ouve o PC? O PC ouve você? | |
| 3 | Mic aberto, **outro app na frente 5 min** (um app sem som): mesmas duas perguntas | |
| 4 | Bloqueado 5 min: no PC você continua "ativo" na lista? | |
| 5 | **AirPods**, toque na haste (bloqueado): a tela de teste mostra `CALLKIT_MUTE`? O mic alterna **e o PC confirma**? A chamada continua? Ouve o som de confirmação? | |
| 6 | **EarPods** (com fio), aperto no meio (bloqueado): mostra `CALLKIT_END` ou `MEDIA_*`? Mic alterna, PC confirma, chamada continua? | |
| 7 | Botão vermelho de encerrar na tela bloqueada/Dynamic Island: o que acontece? (esperado: alterna o mic, não sai) | |
| 8 | **Ligação de celular** chegando com você numa linha → "Encerrar e Atender": a ligação conecta? Depois de desligar a ligação, o áudio do intercom volta? O botão do fone volta a funcionar? | |
| 9 | Ligação chegando → "Recusar" e, se aparecer, "Em espera e Atender": o que acontece? | |
| 10 | "Sair da linha": a chamada verde some? A tela de teste **não** mostra `CALLKIT_END`? | |
| 11 | Entrar/sair/entrar rápido ~5 vezes: no fim, uma única chamada verde se estiver numa linha, nenhuma se não estiver | |
| 12 | Primeiro uso: os pedidos de permissão de microfone e Bluetooth aparecem em português? | |

Os tocar/pausar da Central de Controle provavelmente não fazem nada — é esperado, não precisa testar.

## 7. O que me mandar

A tabela preenchida (pode ser foto) e, se algo falhou, o que a tela "Teste do botão do fone" mostrou.
- Linha 2 ou 3 falhou (mic ou áudio mudo bloqueado) → paro e preparo outro caminho (WebRTC nativo).
- Linha 4 falhou ("inativo") → faço o heartbeat nativo no iOS (já planejado).
- Linhas 5–6 sem nenhum evento → anoto por fone e preparo um ajuste.
