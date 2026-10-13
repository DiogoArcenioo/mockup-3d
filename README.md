# forma — Mockup Studio

Gerador de mockups de canecas em 3D, feito com TypeScript, Three.js e Vite. A arte é aplicada com coordenadas UV ao corpo curvo da caneca; o interior e a alça continuam em cerâmica. O encaixe inicial e o controle de escala preservam as proporções da imagem usando as dimensões físicas da superfície; o ajuste de altura permite esticar só o sentido vertical.

## Abrir no Windows

Dê dois cliques em **INICIAR.cmd**. O site abre em **http://127.0.0.1:5173**. Mantenha a janela do terminal aberta enquanto usa o estúdio. A primeira instalação precisa de internet e Node.js 24 LTS. As dependências já estão instaladas nesta pasta.

Para usar o **Live Server do VS Code**, abra **dist/index.html** com **Open with Live Server**. Com a pasta do projeto como raiz, o endereço é **http://127.0.0.1:5500/dist/index.html**. O `index.html` da pasta principal precisa do Vite. Depois de alterar o código, execute `npm.cmd run build` para atualizar `dist`.

Ou execute no terminal, dentro da pasta do projeto:

```powershell
npm.cmd ci
npm.cmd run dev
```

## Criar um mockup

1. O estúdio abre com canecas brancas sem estampa. Envie uma arte PNG, JPG, WebP ou SVG, ou arraste o arquivo para a área de upload. Limite de 20 MB. **Remover arte** deixa a caneca vazia, mantendo a cor selecionada; **Recomeçar** restaura o estado inicial.
2. Em **Ajustar a arte**, ajuste escala e posição. **Altura da estampa** aumenta ou reduz somente a dimensão vertical, mantendo a largura e a distância da alça. **Preencher altura da caneca** centraliza verticalmente a estampa e cobre toda a lateral, do topo à base. **Escala** continua ampliando as duas dimensões na mesma proporção. **Arte contínua ao redor da caneca**, a opção inicial, aplica uma única imagem à superfície em 360°. **Repetir na frente e no verso** permite repetir uma marca nos dois lados.
3. Escolha **Frente e verso**, **Individual** ou **Detalhe**. No primeiro enquadramento, as duas canecas têm exatamente o mesmo tamanho, altura e profundidade, com ângulos separados por 180°. Elas compartilham a mesma textura: girar 180° revela o verso na esquerda e a frente na direita. Arraste a visualização para orbitar e use a roda do mouse para aproximar. O botão de restaurar câmera volta ao ângulo inicial, mantendo seus ajustes de giro.
4. Em **A cena**, escolha **Branca** ou **Preta** em **Cor da caneca**. Corpo, interior e alça mudam juntos nas duas vistas, sem mover a estampa. Escolha fundo estúdio, areia, sálvia ou transparente; formato quadrado, horizontal ou retrato; e resolução de 1080, 2400 ou 3600 px no lado maior.
5. Clique em **Baixar mockup**. O PNG é renderizado na resolução escolhida, sem interface e sem marca d'água. O fundo transparente exporta apenas as canecas, sem piso nem sombras.

PNG com transparência funciona bem para nomes, logotipos e ilustrações. Para uma estampa panorâmica, uma proporção próxima de **21 × 9 cm** é um bom ponto de partida. Artes em SVG devem incluir largura e altura e não depender de recursos externos. Fontes convertidas em curvas preservam o resultado entre navegadores.

Na caneca preta, as áreas transparentes deixam a cerâmica aparecer; o branco presente na imagem permanece como tinta branca. A cor selecionada também é aplicada ao PNG baixado, inclusive sem estampa.

Fundos pretos neutros da imagem se integram automaticamente à cerâmica preta, com os mesmos reflexos, para evitar um retângulo chapado ao redor da estampa. Tons quase pretos passam por uma transição suave; as tintas coloridas, inclusive vermelho e azul escuros, continuam preservadas. A prévia e o PNG usam o mesmo tratamento.

O modelo é uma simulação para apresentação, não um gabarito de impressão. A arte circula pela superfície inteira, inclusive quando deslocada através da emenda da textura. O encaixe inicial preserva a proporção e pode deixar áreas sem estampa; ajuste escala e posição se quiser ampliar a cobertura. O controle de altura remove as faixas sem estampa no topo e na base externa sem mudar a margem lateral próxima da alça. O interior e a borda interna continuam em cerâmica. Artes com margens transparentes ou brancas no próprio arquivo podem precisar de mais altura para ocupar a lateral. Para produção, use as medidas do fornecedor.

As cores sRGB da imagem são preservadas nas áreas frontais. O brilho e a exposição da cerâmica são calculados separadamente da estampa, com escurecimento neutro e suave nas laterais para manter a curvatura sem desbotar as cores. PNGs usam o mesmo tratamento de cor da prévia. Durante o giro, a separação se ajusta para dar espaço às alças voltadas para o centro; a escala das duas canecas permanece idêntica.

## Hospedar em um servidor

Não é necessário banco de dados, API nem serviço de renderização. Toda a geração acontece no navegador. Artes enviadas não saem do computador e não são persistidas ao recarregar a página. A fonte e o modelo são recursos locais, sem CDN em tempo de execução.

Gere a versão de produção:

```powershell
npm.cmd run build
```

Publique **o conteúdo da pasta dist/** no diretório público do seu servidor (Nginx, Apache, hospedagem compartilhada ou serviço de arquivos estáticos). Os caminhos são relativos, então também é possível hospedar em uma subpasta. Sirva por HTTP ou HTTPS, não abrindo o HTML diretamente pelo explorador de arquivos.

Confira a compilação localmente:

```powershell
npm.cmd run preview
```

A prévia de produção abre em **http://127.0.0.1:4173**.

## Instalar como app no Android

O site agora é uma **PWA**, instalável pelo navegador. O app usa uma caneca branca sobre fundo verde, abre em uma janela própria e mantém upload de arte, visualização 3D e download de PNG. O ícone também aparece na aba do navegador e no cabeçalho.

1. Publique o conteúdo de `dist/` em um servidor com **HTTPS**.
2. No Android, abra o endereço publicado no Chrome e toque em **Instalar app**. Confirme a instalação oferecida pelo navegador.
3. Se a opção automática ainda não estiver disponível, use **⋮ → Instalar app** ou **Adicionar à tela inicial**. O botão do site também mostra essas instruções.
4. Abra **forma** pela tela inicial. Depois do primeiro carregamento completo com internet, o estúdio funciona offline com arquivos do próprio aparelho. A arte continua temporária e não é salva ao fechar ou recarregar.

A instalação é feita pelo navegador; não há APK para baixar nem publicação na Play Store nesta versão. Para conferir no computador, use a versão compilada no Live Server (`/dist/index.html`) ou `npm.cmd run preview`. HTTP em `localhost`/`127.0.0.1` é permitido para testes; abrir pelo IP da rede em HTTP no celular não habilita a instalação completa. [Requisitos de instalação do Chrome](https://web.dev/articles/install-criteria).

Com o Live Server aberto, `/tests/pwa-check.html` confere os ícones e os arquivos offline no navegador, depois de abrir o estúdio uma vez. `/tests/mobile-check.html` permite conferir a interface e as instruções em uma largura de 390 px.

Cada compilação gera `dist/sw.js` com a versão e a lista dos arquivos locais. Novas versões aguardam as janelas do app fecharem para preservar o mockup aberto. Subpastas usam seus próprios caches. O cache inclui interface, fonte e ícones, sem guardar as artes enviadas. Sirva `sw.js` sem cache prolongado no servidor. Os ícones PNG estão em `public/icons/`; o original vetorial é `public/favicon.svg` e o script `scripts/generate-icons.ps1` gera as versões para Android.

Também há um Dockerfile:

```sh
docker build -t forma-mockup .
docker run --rm -p 8080:80 forma-mockup
```

Abra **http://localhost:8080**. O Dockerfile usa Nginx para servir os arquivos estáticos; o Node.js só é necessário para compilar.

## Requisitos e desenvolvimento

- Node.js 24 LTS e npm para desenvolvimento/compilação.
- Chrome, Edge, Firefox ou Safari atualizado com WebGL 2 e aceleração de hardware.
- Exportações grandes dependem dos limites gráficos do dispositivo. Se 3600 px falhar, escolha uma resolução menor.
- `src/scene.ts`: geometria das canecas, iluminação, câmeras e renderização/exportação.
- `src/artwork.ts`: tamanho físico e posicionamento da arte na textura.
- `src/print-material.ts`: tratamento de cor da estampa separado da iluminação da cerâmica.
- `src/mug-layout.ts`: posições, escala idêntica e ângulos de frente e verso.
- `src/main.ts`: interface e operações de arquivo.
- `src/style.css`: aparência e versão responsiva.

Execute `npm.cmd test` para verificar proporção física, encaixe, dimensões idênticas e giro de frente e verso. Com o servidor de desenvolvimento aberto, acesse `/tests/render-check.html` para medir as cores dos pixels no WebGL e no PNG, conferir a escala projetada, a troca dos lados ao girar 180°, a continuidade da emenda em 360° e a ausência de contorno no fundo branco da arte em prévias de 360 e 600 px. A verificação também cobre cores, transparência e tinta branca na caneca preta, remoção da estampa e exportação da cerâmica preta. A integração do fundo preto é comparada à caneca sem estampa em 18 combinações de tom, tamanho e giro, incluindo a exportação e a preservação de tintas vermelhas e azuis escuras. A pasta `exemplos/` contém imagens geradas pelo estúdio.

O modelo é gerado pelo código, sem arquivo 3D externo. Para acrescentar outros produtos, crie geometrias e áreas UV correspondentes em `scene.ts`.
