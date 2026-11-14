# Infinity — Sistema da loja

Sistema de gestão de canecas, camisetas e capinhas, com identidade em preto e branco e interface pensada primeiro para o celular.

## Começar

Use Node.js 24 LTS. Na pasta do projeto:

```powershell
npm.cmd ci
npm.cmd run dev
```

Abra **http://localhost:5173**. No Windows, também é possível abrir **INICIAR.cmd**. O Next atende na porta 5173 e encaminha as chamadas à API Nest, na porta 3001. A API fica vinculada a `127.0.0.1` e não precisa ser exposta publicamente. Para abrir pelo celular na mesma rede, configure `APP_ORIGIN` com a origem completa do computador (por exemplo, `http://192.168.1.10:5173`).

O `.env` local está configurado para o banco informado. Em outra instalação, copie `.env.example` para `.env` e preencha os dados privados. Senhas e conexão com o banco nunca usam variáveis `NEXT_PUBLIC_*` e não são incluídas no navegador.

## Login e equipe

- A tela inicial é o login, sem cadastro público.
- O administrador inicial usa o usuário **diogo** e a senha definida pelo proprietário no `.env` privado.
- Apenas administradores podem listar e criar usuários em **Usuários**, inclusive pela API.
- Contas da equipe têm acesso ao estoque, ao financeiro e ao Studio 3D.
- Senhas são armazenadas com scrypt e salt aleatório. Os cookies de sessão são HttpOnly, com SameSite=Lax; apenas o hash do token é salvo no banco.
- A sessão comum vence em 12 horas e o cookie é de sessão do navegador. **Manter conectado** habilita cookie persistente por 30 dias. Sair revoga a sessão no banco.
- Tentativas de acesso são limitadas por usuário e IP em janelas de 15 minutos, com contadores persistentes no PostgreSQL.

A inicialização cria o esquema `forma_auth` e o administrador somente se esse login ainda não existir. Reiniciar não redefine senhas nem substitui usuários. Depois da primeira inicialização, `ADMIN_PASSWORD` pode ser removida do ambiente; a conta continua no banco. Para preparar o banco sem iniciar o aplicativo:

```powershell
npm.cmd run db:migrate
```

## Organização e escopo desta etapa

- `apps/web`: Next.js App Router, login, início, menu responsivo e gestão de acessos.
- `apps/api/src`: entrada Nest, autenticação, sessões, validações e permissões administrativas.
- `server`: regras e transações financeiras existentes, reaproveitadas dentro do Nest.
- `src`: estúdio Three.js e interface de produtos, compras e estoque preservados.

A migração é progressiva: o sistema principal e as novas telas usam Next; estoque, compras e Studio 3D continuam no módulo Vite existente, integrado em telas protegidas dentro do sistema. A API de entrada já é Nest. A conversão interna dessas telas e das rotas financeiras para componentes e serviços nativos pode ser feita nas próximas etapas, preservando os dados existentes.

O menu **Studio 3D** abre a tela de criação de mockups. Upload, ajustes, giro, troca da cor da caneca e exportação PNG continuam no navegador, sem enviar a arte ao servidor. As cores da arte e da caneca são preservadas; apenas a interface segue a identidade monocromática.

No menu **Estoque**, as abas superiores são **Produtos** e **Histórico**. As duas permitem cadastrar produtos; os cards oferecem **Entrada** e **Venda**. Registre entradas com embalagem, quantidade por embalagem, custo total e data da compra. Cada entrada calcula quantidade e custo unitário, preserva os dados do produto no momento da compra e grava estoque e compra na mesma transação. Repetir uma requisição não duplica estoque. O histórico mostra último custo e média ponderada. O menu **Financeiro** reúne o extrato e os demais lançamentos de dinheiro em uma tela própria.

### Categorias, cores e marcas

Produtos para revenda usam uma das três categorias: **Canecas**, **Camisetas** ou **Acessórios para celular**. A categoria também filtra as listas de produtos e estoque. Cadastros antigos continuam disponíveis como **Sem categoria**, para classificação manual; insumos para uso e consumo podem continuar sem categoria.

Ao selecionar qualquer categoria, aparece o campo **Cor**, opcional, com a opção **Sem cor**. Todas as categorias usam o mesmo catálogo de cores. As cores iniciais são Branco, Preto, Azul, Vermelho, Verde, Amarelo, Rosa, Roxo, Cinza, Bege, Marrom, Laranja e Transparente. **Camisetas** também mostra **Marca**, opcional, com Nike e Adidas já cadastradas.

Use **Cadastrar** ao lado de Cor ou Marca para digitar um nome e cadastrá-lo no próprio formulário. A nova opção já fica selecionada, sem perder os dados do produto. Repetir um nome, ignorando maiúsculas e espaços nas pontas, reutiliza a opção existente. Trocar de camiseta para outra categoria limpa a marca.

O mesmo nome de produto pode ser usado em variações diferentes de categoria, cor e marca, cada uma com seu próprio saldo. A lista, o seletor de entradas e os detalhes exibem essas informações. Novas compras guardam uma cópia da categoria, cor e marca da época; editar o produto não altera seu histórico. Compras antigas não recebem atributos retroativos.

Esta etapa entrega login, contas e a estrutura de navegação, preservando os controles anteriores. Contas a pagar/receber, metas, pontos e recompensas ainda não foram implementados. A tela de início orienta os primeiros passos sem apresentar vendas, saldos ou progresso fictícios.

## Verificação

```powershell
npm.cmd run build
npm.cmd test
```

Com o Next e o Nest iniciados e o `.env` configurado:

```powershell
npm.cmd run test:auth
npm.cmd run test:password
npm.cmd run test:web
npm.cmd run test:integration
npm.cmd run test:finance
```

Os testes de autenticação conferem hashes, login, cookies, autorização, criação exclusiva pelo administrador, proteção da API e revogação da sessão. Um usuário temporário é criado e removido ao final. O teste de concorrência cria um produto temporário, disputa sua última unidade com duas vendas simultâneas e remove seus registros ao final. Os testes web verificam via HTTP os redirecionamentos, o proxy, as páginas e os arquivos protegidos do módulo 3D. Não substituem a conferência visual em dispositivos reais. O teste financeiro usa transação revertida ao final.

O comando `test:browser` e os testes manuais antigos verificam o módulo financeiro isolado e o renderizador; não cobrem o novo login Next. A integração autenticada não registra o service worker antigo: páginas e dados da loja não são armazenados no cache offline.

## Produção

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Configure `APP_ORIGIN` com a URL HTTPS pública e `COOKIE_SECURE=true`. O sistema exige cookies seguros em produção. Use um proxy HTTPS para o Next, mantendo a API Nest privada. A conexão PostgreSQL usa as variáveis privadas do servidor. As tabelas financeiras ficam no esquema `forma_finance`; as de acesso ficam em `forma_auth`. Migrações adicionam suas tabelas sem apagar dados existentes.

Também há um Dockerfile com as duas aplicações:

```powershell
docker build -t infinity-store .
docker run --rm --env-file .env -e WEB_PORT=8080 -e COOKIE_SECURE=true -e APP_ORIGIN=https://sua-loja.exemplo -p 8080:8080 infinity-store
```

Use um arquivo de ambiente próprio para produção. O `.env` é ignorado pelo Git e pelo Docker. O Nest permanece na porta interna 3001 e o Next atende na porta 8080 do container.

### Registrar entradas e vendas

As ações abrem formulários sobre a tela atual, sem abas separadas de Entrada ou Estoque. Na venda, escolha um produto para revenda, quantidade, valor total e data; cliente e observações são opcionais. O formulário mostra o saldo disponível. Salvar cria a venda e baixa o estoque na mesma transação. A API impede estoque insuficiente e unidades fracionadas quando a unidade é `un`. Repetir a mesma requisição não duplica a venda; vendas concorrentes bloqueiam o produto durante a conferência do saldo.

O Histórico reúne entradas e vendas, com totais separados de compras e vendas, filtro por tipo, produto e datas e botões para repetir uma operação sobre o produto. Cores, marcas e nome são preservados em cada movimentação. Os custos de compra continuam baseados nas entradas. O registro de venda é um controle da loja; não representa cobrança ou recebimento financeiro integrado.

### Financeiro

O menu Financeiro tem uma tela Next própria, com abas Extrato, Compras, Sócios, Despesas e Atividades. Compras e vendas antigas e novas compõem o extrato automaticamente, sem duplicar registros. O controle considera essas operações pagas na data informada; não há integração bancária ou contas a pagar/receber. Despesas, pagamentos a usuários ativos, outras entradas e ajustes de saldo são registrados com valor em centavos, data, observação opcional e responsável. O nome do sócio fica preservado no pagamento.

O extrato mostra saldo anterior, entradas e saídas no período, saldo final, saldo acumulado por lançamento e saldo atual até hoje (excluindo datas futuras). O filtro de tipo restringe a lista; os saldos gerais continuam considerando todos os tipos. O saldo parte de zero: para incluir valores anteriores, registre a diferença em um ajuste, considerando as compras e vendas já incluídas. Saídas e saldos negativos aparecem em vermelho.

As alterações em produtos, cores, marcas, fotos, compras, vendas, estoque, lançamentos e usuários geram auditoria na mesma transação da operação. Alterações de senha registram o evento, nunca o hash ou a senha. A identidade do responsável usa configuração local à transação, sem contaminar conexões do pool. O histórico de atividades começa na ativação da migração; operações financeiras anteriores aparecem sem responsável identificado. Usuários autenticados têm acesso às informações; criação de usuários e troca de senha alheia continuam exclusivas do administrador. Não há edição ou exclusão de lançamentos pela API: correções podem ser registradas como ajuste com descrição e observação, preservando o histórico.

O teste `test:finance` valida os saldos, datas futuras, integração com estoque, seleção de sócio, auditoria e reenvio sem duplicação no PostgreSQL real, revertendo todos os dados ao final.

### Configurações da conta

Clique no nome ou avatar do cabeçalho e escolha **Alterar senha**. Cada usuário altera a própria senha informando a senha atual, a nova senha (8 a 256 caracteres) e a confirmação. Administradores também podem selecionar outro usuário ativo; nesse caso, confirmam com a própria senha de administrador, sem precisar saber a senha antiga da outra pessoa.

Ao salvar, todas as sessões da conta alterada são encerradas. Na troca da própria senha, o sistema volta ao login e informa que é necessário entrar novamente. Ao alterar a senha de outra pessoa, o administrador continua conectado. As permissões são verificadas na API, as senhas continuam armazenadas apenas como hash scrypt e as tentativas são limitadas por conta. O teste `test:password` usa contas temporárias, verifica as permissões e a concorrência com o login, e remove essas contas ao final, preservando a senha do administrador real.
