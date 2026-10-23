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

## 4b. Atualizar quando eu mandar correção

```bash
cd intercom-frontend
git checkout ios/App/Podfile.lock   # descarta o lock gerado pelo pod install anterior
git pull
VITE_BACKEND_URL=https://intercom.ac24horas.com/manager npm run ios:build
cd ios/App && pod install && cd ../..
```

Depois **▶ (Run)** no Xcode. O `pod install` é obrigatório depois de cada `git pull`: o app usa a biblioteca WebRTC nativa (pod `WebRTC-lib`); sem ele o Xcode acusa `No such module 'WebRTC'`. Se o build falhar com `Sandbox: rsync deny`, me avise.

## 5. Antes de testar

- No app: **Configurações → Saída de áudio → escolha o fone** (Bluetooth ou com fio). Isso escolhe o **som e o mic** juntos. O campo "Microfone" não vale no iPhone.
- Deixe o PC numa linha para ouvir/falar com o iPhone.
- **Configurações → Teste do botão do fone** mostra o que o app fez: `ROTA … mic: <nome>`, `FONE ligou/desligou`, `RECONEXÃO …`, etc.
- No iPhone não há mais "chamada" verde nem widget: isso é esperado.

## 6. Testes — anote o resultado de cada linha

| # | Teste | Resultado |
|---|---|---|
| 1 | JBL ligado, Saída de áudio = Bluetooth, entrar na linha: o PC ouve pelo **mic do JBL** já na primeira vez? (lista: `ROTA bluetooth · mic: JBL…`) | |
| 2 | EarPods com fio, Saída de áudio = fone com fio: o PC ouve pelo **mic do EarPods**? | |
| 3 | Mic aberto, **bloquear 10 min**: ouve o PC? O PC ouve você? No PC você segue "ativo"? | |
| 4 | Bloqueado, **botão do fone**: cada aperto liga/desliga o mic uma vez, com som de confirmação? O PC confirma? | |
| 5 | Bloqueado, **desligar o Wi-Fi** (com 4G) e depois religar; e também ficar ~1 min sem sinal nenhum: a linha volta sozinha (som de entrada)? Sem usuário duplicado no PC? | |
| 6 | Linha de trabalho + "Áudio programa": ouve as duas? O botão do fone mexe só no mic da linha de trabalho? | |
| 7 | Arrastar o app para fechar: você some da lista do PC em segundos? | |
| 8 | Mic aberto, **receber uma ligação** (ou tocar um áudio de WhatsApp): depois, o som volta com o sinal e o **mic volta fechado**? | |
| 9 | Spotify/Música tocando, abrir o app **sem entrar em linha**: a música continua? Entrar e sair de uma linha: a música volta depois de sair? | |

## 7. O que me mandar

A tabela preenchida (pode ser foto) e, se algo falhou, o print da tela "Teste do botão do fone" logo depois.
