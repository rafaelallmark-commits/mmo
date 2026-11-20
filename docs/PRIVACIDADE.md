# Política de privacidade — Cinzas do Meridiano (teste público)

*Rascunho para o teste público. Antes de abrir para o público, preencha o responsável e o contato e
revise com assessoria jurídica (LGPD — Lei 13.709/2018).*

**Responsável pelo tratamento**: [nome / razão social] — contato: [e-mail do encarregado].

## O que guardamos

| Dado | Para quê | Por quanto tempo |
|---|---|---|
| Nome da conta, e-mail | Entrar no jogo, confirmar a conta, recuperar a senha | Enquanto a conta existir |
| Senha | Entrar no jogo — guardamos só um resumo (scrypt com sal), nunca a senha | Enquanto a conta existir |
| Personagens, itens, missões, ouro, tempo jogado | Fazer o jogo funcionar e medir o ritmo de progressão | Enquanto a conta existir |
| Registros de segurança: entradas (com endereço IP), comandos de mestre, saque, compras, refino, recompensas, trocas entre jogadores, expulsões por excesso de comandos, suspensões e silêncios | Prevenir trapaça e fraude, investigar problemas | 90 dias (configurável no servidor) |
| Denúncias: quem denunciou, quem foi denunciado, o motivo e as **últimas 20 falas do denunciado** que quem denunciou podia ver (só as da última hora: as do mapa e os sussurros, falas de grupo e de clã que chegaram a quem denunciou) | Analisar a denúncia | 90 dias, como os registros de segurança |
| Relatos de problema (`/bug`): o texto, o personagem, o mapa, a posição e as versões do jogo | Corrigir o problema relatado | 90 dias, como os registros de segurança |
| Suspensão ou silêncio da conta (até quando e por quê) | Aplicar as regras de convivência | Enquanto valer; o histórico fica nos registros de segurança |
| Códigos de confirmação e de troca de senha | Confirmar o e-mail e trocar a senha | 30 minutos de validade; apagados depois de 1 dia |
| Métricas de operação (tempo de processamento, banda, número de jogadores) | Manter o servidor saudável | Sem dados pessoais |

**Não guardamos** o conteúdo do chat (as mensagens só passam pelo servidor; o servidor mantém em memória
as últimas falas de cada personagem por até 1 hora, e só as grava se ele for denunciado), nem dados de pagamento.

## Base legal

Execução do contrato de uso do jogo (conta, personagens) e legítimo interesse na segurança do
serviço (registros de segurança), nos termos do art. 7º da LGPD.

## Compartilhamento

Não vendemos nem compartilhamos dados. Usamos apenas provedores necessários para operar: hospedagem
do servidor e envio de e-mail (SMTP), sob contrato.

## Seus direitos (art. 18 da LGPD)

- **Acesso e portabilidade**: o serviço de contas devolve, em JSON, tudo o que guardamos da sua conta
  (`POST /contas/dados` com conta e senha): conta (com suspensão e silêncio), personagens, itens, missões,
  clãs e os registros de segurança da conta e dos personagens. As denúncias que você fez vêm sem as falas
  do denunciado (são dados de outra pessoa, guardados só para a equipe analisar).
- **Exclusão**: no jogo (tela de personagens) ou pelo serviço de contas (`POST /contas/excluir`).
  Na exclusão apagamos na hora o e-mail, a senha, os itens e as missões; o nome da conta e dos
  personagens é trocado por um código anônimo. Registros de segurança ligados à conta ficam até
  completar os 90 dias e então são apagados. Cópias de segurança do banco são rotacionadas e
  substituídas em até 14 dias.
- **Correção**: troca de senha por código enviado ao e-mail; demais correções pelo contato acima.

## Segurança

Conexão criptografada (TLS/`wss://`), senha com scrypt, sessão por token de 5 minutos e uso único,
limite de tentativas e de comandos por conexão, registros de auditoria.

## Idade

O jogo é destinado a maiores de 13 anos; menores de 18 devem ter autorização dos responsáveis.

## Mudanças

Avisaremos no jogo e no site antes de mudanças relevantes nesta política.
