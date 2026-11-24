# Política de privacidade — Cinzas do Meridiano (teste público)

*Versão 1, a mesma numeração dos Termos de Uso (rascunho para o teste público). Antes de abrir para o
público, preencha o responsável e o contato e revise com assessoria jurídica (LGPD — Lei 13.709/2018).*

**Responsável pelo tratamento**: [nome / razão social] — contato: [e-mail do encarregado].

## O que guardamos

| Dado | Para quê | Por quanto tempo |
|---|---|---|
| Nome da conta, e-mail | Entrar no jogo, confirmar a conta, recuperar a senha | Enquanto a conta existir; conta nunca confirmada é apagada depois de 7 dias |
| Senha | Entrar no jogo — guardamos só um resumo (scrypt com sal), nunca a senha | Enquanto a conta existir |
| Aceite dos Termos de Uso e desta política: a versão aceita e quando | Registrar o seu consentimento e saber quando pedir um aceite novo | Enquanto a conta existir |
| Personagens, itens, missões, ouro, tempo jogado | Fazer o jogo funcionar e medir o ritmo de progressão | Enquanto a conta existir |
| Lista de ignorados de cada personagem (quem você ignorou e quando) | Não mostrar a você as falas e os convites de quem você ignorou | Enquanto o personagem existir (sai com ele ou quando você designora) |
| Registros de segurança: entradas (com endereço IP), comandos de mestre, saque, compras, refino, recompensas, trocas entre jogadores, expulsões por excesso de comandos, suspensões e silêncios, nomes trocados e itens ou ouro retirados pela equipe, senhas erradas ao excluir conta ou personagem e exclusões de personagem (com o nome que ele tinha) | Prevenir trapaça e fraude, investigar problemas | 90 dias (configurável no servidor) |
| Denúncias: quem denunciou, quem foi denunciado, o motivo e as **últimas 20 falas do denunciado** que quem denunciou podia ver (só as da última hora: as do mapa e os sussurros, falas de grupo e de clã que chegaram a quem denunciou). Quem da equipe está no jogo recebe na hora um aviso com os dois nomes e o motivo | Analisar a denúncia | 90 dias, como os registros de segurança |
| Relatos de problema (`/bug`): o texto, o personagem, o mapa, a posição e as versões do jogo | Corrigir o problema relatado | 90 dias, como os registros de segurança |
| Registros de jogo do personagem: quedas (mapa, nível, classe, posição e o que o derrubou), fim de cada sessão (duração, nível e mapa), missões aceitas e tentativas no calabouço | Ajustar a dificuldade, o ritmo e a economia do jogo durante o teste (só em relatórios agregados, sem identificar ninguém) | 90 dias, como os registros de segurança |
| Suspensão ou silêncio da conta (até quando e por quê) | Aplicar as regras de convivência | Enquanto valer; o histórico fica nos registros de segurança |
| Códigos de confirmação e de troca de senha | Confirmar o e-mail e trocar a senha | 30 minutos de validade; apagados depois de 1 dia |
| Controle de envios e de tentativas: a hora de cada e-mail que mandamos, com a conta e um resumo criptográfico (SHA-256) do endereço de destino, e a hora de cada código digitado errado | Limitar os e-mails (um por minuto e 10 por dia por conta e por endereço) e as tentativas de código (20 erradas por dia por conta) contra abuso | 24 horas |
| Métricas de operação (tempo de processamento, banda, número de jogadores) | Manter o servidor saudável | Sem dados pessoais |

**Não guardamos** o conteúdo do chat (as mensagens só passam pelo servidor; o servidor mantém em memória
as últimas falas de cada personagem por até 1 hora, e só as grava se ele for denunciado), nem dados de pagamento.

## Base legal

Execução do contrato de uso do jogo (conta, personagens) e legítimo interesse na segurança do
serviço (registros de segurança), nos termos do art. 7º da LGPD.

## Compartilhamento

Não vendemos nem compartilhamos dados. Usamos apenas provedores necessários para operar: hospedagem
do servidor, envio de e-mail (SMTP) e, se usado, armazenamento das cópias de segurança fora do servidor (cifradas
antes de sair dele), sob contrato. Os avisos de operação que a equipe recebe (e-mail, Telegram ou Discord) e o
monitor de disponibilidade levam só números do servidor, sem dados de jogadores.

## Seus direitos (art. 18 da LGPD)

- **Acesso e portabilidade**: no jogo, na tela de personagens, **Baixar meus dados** (pede a senha) grava
  um arquivo JSON com tudo o que guardamos da sua conta na pasta de dados do jogo, mostra o caminho (com um
  botão para abrir a pasta) e deixa salvar uma cópia onde você quiser. O mesmo conteúdo vem do serviço de
  contas (`POST /contas/dados` com conta e senha): conta (com o aceite dos termos — versão e data —,
  suspensão e silêncio), personagens, itens, missões, clãs, as listas de ignorados e os registros de
  segurança da conta e dos personagens, inclusive as ações da equipe contra a sua conta (suspensões, silêncios,
  expulsões, nomes trocados e itens ou ouro retirados, com o motivo, sem identificar quem da equipe agiu). As
  denúncias que você fez vêm sem as falas do denunciado (são dados de outra pessoa, guardados só para a equipe
  analisar); denúncias contra você não vêm (são dados de quem denunciou).
- **Exclusão**: no jogo (tela de personagens, ou na tela de termos novos, se você não quiser aceitá-los)
  ou pelo serviço de contas (`POST /contas/excluir`); um personagem só também pode ser excluído na tela de
  personagens.
  Na exclusão apagamos na hora o e-mail, a senha, os itens, as missões e as listas de ignorados; o nome da
  conta e dos personagens é trocado por um código anônimo. Registros de segurança ligados à conta ficam até
  completar os 90 dias e então são apagados. Cópias de segurança do banco são rotacionadas e
  substituídas em até 14 dias, inclusive a cópia guardada fora do servidor, quando houver.
- **Exclusão de um personagem** (só no jogo, na tela de personagens, com a senha da conta): apagamos na
  hora os itens que ele carregava, o ouro, as missões e a lista de ignorados dele (e as entradas dele nas
  listas dos outros), e o nome dele vira um código anônimo; as peças que ele guardou no depósito da conta
  continuam com a conta.
- **Correção**: troca de senha por código enviado ao e-mail; demais correções pelo contato acima.

## Segurança

Conexão criptografada (TLS/`wss://`), senha com scrypt, sessão por token de 5 minutos e uso único,
limite de tentativas e de comandos por conexão, limite de e-mails (um por minuto e 10 por dia por conta
e por endereço) e de códigos errados (20 por dia por conta), registros de auditoria.

## Idade

O jogo é destinado a maiores de 13 anos; menores de 18 devem ter autorização dos responsáveis.

## Mudanças

Avisaremos no jogo e na seção *Avisos* da página do teste (`https://[domínio do teste]/`) antes de mudanças
relevantes nesta política. Ela tem o mesmo número de
versão dos [Termos de Uso](TERMOS.md): quando a versão muda, o jogo mostra os textos novos no login
seguinte e pede o seu aceite antes de entrar; se você não quiser aceitar, na mesma tela dá para baixar
seus dados ou excluir a conta.
