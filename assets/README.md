# Assets do Space Slug

Salve aqui os 4 PNGs do personagem. Os nomes precisam ser exatos (minusculos).

| Arquivo     | Conteudo                                              | Frames |
|-------------|-------------------------------------------------------|--------|
| `idle.png`  | 1 frame do personagem parado apontando a arma         | 1      |
| `run.png`   | Sprite sheet horizontal com o ciclo de corrida        | 10     |
| `jump.png`  | Sprite sheet horizontal com as poses de pulo          | 8      |
| `shoot.png` | Sprite sheet horizontal com poses de tiro             | 3+     |

## Dimensoes

O jogo detecta automaticamente a largura do frame dividindo a largura da
imagem pelo numero de frames configurado em `game.js` (`SPRITE_CONFIG`).

Se os numeros de frames dos seus sprites forem diferentes, basta ajustar
`frames` no topo de `game.js`:

```js
const SPRITE_CONFIG = {
    idle:  { src: 'assets/idle.png',  frames: 1,  ... },
    run:   { src: 'assets/run.png',   frames: 10, ... },
    jump:  { src: 'assets/jump.png',  frames: 8,  ... },
    shoot: { src: 'assets/shoot.png', frames: 3,  ... }
};
```

## Fallback

Se os arquivos nao existirem, o jogo continua jogavel usando
retangulos coloridos estilizados como personagem. Uma mensagem
aparece no rodape do canvas avisando.

## Dica

Se os sprites originais do Metal Slug tiverem fundo branco,
converta para transparente (PNG com canal alpha) antes de salvar,
caso contrario o fundo branco vai aparecer atras do personagem.
