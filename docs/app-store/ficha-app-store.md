# Ficha da App Store — Intercom ac24horas (distribuição não listada)

Tudo o que o App Store Connect pede, pronto para copiar. Campos marcados **(você)** só o dono da conta pode preencher.

## 1. Informações do app (App Store Connect → app → Informações do app)

| Campo                          | Valor                                               |
| ------------------------------ | --------------------------------------------------- |
| Nome                           | Intercom ac24horas                                  |
| Subtítulo                      | Intercom de voz da equipe                           |
| Categoria principal            | Negócios                                            |
| Categoria secundária           | Utilidades                                          |
| Direitos de conteúdo           | Não contém, mostra nem acessa conteúdo de terceiros |
| URL da política de privacidade | https://intercom.ac24horas.com/privacidade.html     |

**Classificação etária**: responda "Não"/"Nenhum" em tudo, exceto **Mensagens e bate-papo** (ou "comunicação entre usuários"): **Sim** — a equipe conversa por voz.

## 2. Preço e disponibilidade

- Preço: **Grátis**.
- Disponibilidade: **somente Brasil** (o app usa a chamada do sistema, CallKit, que a China proíbe; e a equipe está no Brasil).

## 3. Privacidade do app (App Store Connect → Privacidade do app)

- "Você ou seus parceiros coletam dados deste app?" → **Sim**.
- Tipo: **Informações de contato → Nome**.
  - Uso: **Funcionalidade do app**.
  - Vinculado à identidade do usuário? **Não** (não há conta; o nome é só um apelido).
  - Usado para rastreamento? **Não**.
- Nada mais. O áudio é transmitido em tempo real e não é guardado, por isso não conta como "coletado" pela definição da Apple.

## 4. Versão 1.0 (App Store Connect → app → iOS App → 1.0)

**Texto promocional** (170):

> Fale e ouça a sua equipe de produção pelo celular, com fone de ouvido e a tela bloqueada.

**Descrição**:

> O Intercom ac24horas é o intercom de voz da equipe de produção do ac24horas. Cada pessoa entra na linha da sua função e conversa com a direção em tempo real, com baixa latência, pelo celular.
>
> • Linhas por produção: entre na sua linha e veja quem está conectado e quem está falando.
> • Microfone aberto ou "apertar para falar", como um rádio.
> • Funciona com a tela bloqueada e o celular no bolso.
> • Botão do fone de ouvido (com fio, EarPods ou Bluetooth) abre e fecha o microfone.
> • Cartão na tela bloqueada e na Dynamic Island com Som, Microfone e quem está falando.
> • Escolha da saída de áudio: fone com fio, Bluetooth ou alto-falante.
>
> Uso exclusivo da equipe e de colaboradores do ac24horas.

**Palavras-chave** (100):

> intercom,interfone,rádio,ptt,voz,comunicação,produção,tv,transmissão,equipe,jornalismo,fone

**URL de suporte**: https://intercom.ac24horas.com/suporte.html
**URL de marketing**: (deixe em branco)
**Copyright**: 2026 ac24horas

**Capturas de tela (iPhone com Dynamic Island, tela média)**: 1206 × 2622, em `docs/app-store/capturas/`.

**Build**: escolha o último enviado pelo Xcode.

**Liberação da versão**: **Manualmente** (assim você decide quando liberar depois da aprovação).

## 5. Informações para a revisão (App Review Information)

- Login necessário: **Não** (desmarque "Sign-in required").
- Contato **(você)**: nome, telefone com +55 e e-mail.
- **Notas** (em inglês, para o revisor):

> This app is the internal voice intercom (VoIP) of the ac24horas TV/news production crew. It is intended for **unlisted distribution**: only our crew and event collaborators will receive the link. No account or login is needed.
>
> How to test:
>
> 1. Open the app and go through the short tutorial (tap "Próximo"), then type any name in "Nome de usuário" and tap "Salvar". Allow microphone access.
> 2. On the home screen, open the production "REVISÃO APPLE" and tap "Entrar" on "Linha de teste". Please use only this production; the others are used by our crew.
> 3. To hear and talk to another participant, open https://intercom.ac24horas.com in a desktop browser (Chrome or Safari), type a name, and join the same production and line. The mic button opens/closes the microphone; "Apertar para falar" is push-to-talk.
> 4. Lock the iPhone: the line keeps working (background audio). The Live Activity on the lock screen shows the line with Sound and Microphone buttons.
> 5. With a headset connected, one press of the headset button opens/closes the microphone. This uses CallKit: while the user is in a line the intercom is presented as an ongoing call, because a Bluetooth headset button only reaches the app through the system call. The "voip" and "audio" background modes keep the live intercom audio running while the screen is locked.
>
> The app does not record audio and has no ads or tracking.

## 6. Pedido de distribuição não listada **(você — só o titular da conta)**

Depois de enviar a versão para revisão, preencha https://developer.apple.com/contact/request/unlisted-app/ com:

- **Nome do app**: Intercom ac24horas
- **Apple ID do app**: o número em App Store Connect → Informações do app → "Apple ID".
- **Para quem é**: equipe interna de produção do ac24horas (cerca de 20 pessoas: jornalistas, cinegrafistas, técnicos e direção) e colaboradores externos contratados para coberturas e eventos.
- **Por que não listado**: é uma ferramenta de trabalho interna, sem uso para o público geral; os usuários recebem o link pelo grupo da equipe.
- **Como os usuários recebem o link**: mensagem interna (WhatsApp da equipe).

A Apple responde por e-mail (normalmente em alguns dias) com o link do app não listado.

## 7. Prints para as capturas de tela **(você)**

Tire no iPhone (botão lateral + volume para cima) e me mande:

1. Tela inicial com a lista de produções.
2. Uma linha aberta com o microfone ligado (alguém falando, se possível).
3. A tela bloqueada com o cartão do Intercom.
4. Uma tela do tutorial.
5. (opcional) Configurações com a saída de áudio.

Evite prints com nomes de pessoas de fora da equipe ou informações internas sensíveis.
