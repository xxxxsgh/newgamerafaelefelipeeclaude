# Space Slug

Jogo de tiro 2D estilo Metal Slug, feito com HTML5 Canvas puro.

## Como rodar

Abra `index.html` direto no navegador, ou sirva a pasta com um
servidor local para que os sprites carreguem corretamente:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Controles

| Tecla                 | Acao                 |
|-----------------------|----------------------|
| `A` / `<-`            | Andar esquerda       |
| `D` / `->`            | Andar direita        |
| `W` / `Espaco` / `^`  | Pular                |
| `J`                   | Atirar               |
| `K` (segurar)         | Tiro carregado azul  |

## Sprites

Os sprites do personagem vao na pasta `assets/`. Veja
[`assets/README.md`](assets/README.md) para os nomes e formatos
esperados. Se os PNGs nao forem encontrados, o jogo usa graficos
de fallback e continua funcionando.

## Arquivos

- `index.html` - estrutura da pagina com canvas e menus
- `style.css`  - estilo do HUD e das overlays
- `game.js`    - toda a logica do jogo (player, inimigos, tiros, animacoes)
- `assets/`    - sprites do personagem
