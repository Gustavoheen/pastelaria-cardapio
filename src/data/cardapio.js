// Regra: N sabores → N+1 adicionais grátis
export const REGRA_ADICIONAIS = { 1: 2, 2: 3, 3: 4, 4: 5 }

export const SABORES_SALGADOS = [
  'Bacon', 'Calabresa', 'Carne Moída', 'Carne Seca', 'Frango Desfiado',
  'Lombo', 'Queijo Minas', 'Queijo Mussarela', 'Queijo Prato',
  'Presunto', 'Bife de Hambúrguer'
]

export const SABORES_DOCES = [
  'Nutella', 'Nutella c/ Banana', 'Nutella c/ Paçoca', 'Nutella c/ Coco',
  'Ferrero Rocher', 'Romeu e Julieta', 'Banana c/ Canela e Açúcar'
]

export const ADICIONAIS_LISTA = [
  'Alho Torrado', 'Azeitona Verde', 'Azeitona Preta', 'Catupiry',
  'Cebola', 'Cheddar', 'Ervilha', 'Milho', 'Orégano', 'Ovos',
  'Palmito', 'Passas', 'Pimenta Biquinho', 'Pimentão', 'Tomate'
]

// Tipos de pastel — cada um abre o ModalSabores
export const TIPOS_PASTEL = [
  { id: 'p1', nome: 'Pastel 1 Sabor',    subtitulo: '1 sabor + 2 adicionais grátis',   preco: 12.00, maxSabores: 1, maxAdicionais: 2, tipo: 'salgado' },
  { id: 'p2', nome: 'Pastel 2 Sabores',  subtitulo: '2 sabores + 3 adicionais grátis',  preco: 14.00, maxSabores: 2, maxAdicionais: 3, tipo: 'salgado' },
  { id: 'p3', nome: 'Pastel 3 Sabores',  subtitulo: '3 sabores + 4 adicionais grátis',  preco: 16.00, maxSabores: 3, maxAdicionais: 4, tipo: 'salgado' },
  { id: 'p4', nome: 'Pastel 4 Sabores',  subtitulo: '4 sabores + 5 adicionais grátis',  preco: 17.00, maxSabores: 4, maxAdicionais: 5, tipo: 'salgado' },
]

// Pastéis doces — cada sabor com preço individual
export const PASTEIS_DOCES = [
  { id: 'pd-nutella',         nome: 'Nutella',                preco: 17.00 },
  { id: 'pd-nutella-banana',  nome: 'Nutella c/ Banana',      preco: 18.00 },
  { id: 'pd-nutella-pacoca',  nome: 'Nutella c/ Paçoca',      preco: 18.00 },
  { id: 'pd-nutella-coco',    nome: 'Nutella c/ Coco',        preco: 18.00 },
  { id: 'pd-ferrero',         nome: 'Ferrero Rocher',         preco: 20.00 },
  { id: 'pd-romeu-julieta',   nome: 'Romeu e Julieta',        preco: 16.00 },
  { id: 'pd-banana-canela',   nome: 'Banana c/ Canela',       preco: 16.00 },
  { id: 'pd-nutella-granulado', nome: 'Nutella c/ Granulado', preco: 18.00 },
]

// ── Fotos locais ─────────────────────────────────────────────────
const B = (f) => `/bebidas/${f}`

// Bebidas
export const categorias = [
  {
    id: 'bebidas', nome: 'Bebidas', emoji: '🥤',
    itens: [
      // ── Sucos Del Valle ──────────────────────────────────────────
      {
        id: 'dv450', nome: 'Del Valle 450ml', subtitulo: 'Suco de fruta',
        preco: 6.00, sabores: ['Laranja', 'Uva'],
        imagem: B('dv450-laranja.png'),
        imagens: { 'Laranja': B('dv450-laranja.png'), 'Uva': B('dv450-uva.png') },
      },
      {
        id: 'dv1l', nome: 'Del Valle 1L', subtitulo: 'Suco de fruta',
        preco: 9.00, sabores: ['Laranja', 'Uva'],
        imagem: B('dv1l-laranja.png'),
        imagens: { 'Laranja': B('dv1l-laranja.png'), 'Uva': B('dv1l-uva.png') },
      },
      {
        id: 'kapo', nome: 'Kapo', subtitulo: 'Suco 200ml',
        preco: 3.00, sabores: ['Laranja', 'Uva'],
        imagem: B('kapo-laranja.png'),
        imagens: { 'Laranja': B('kapo-laranja.png'), 'Uva': B('kapo-uva.png') },
      },

      // ── Brahma ──────────────────────────────────────────────────
      {
        id: 'brahma-latao', nome: 'Super Latão Brahma', subtitulo: 'Chopp 550ml',
        preco: 8.50,
        imagem: B('brahma-latao.png'),
      },

      // ── Monster Energy ───────────────────────────────────────────
      {
        id: 'monster', nome: 'Monster Energy', subtitulo: 'Energético 473ml',
        preco: 11.00, sabores: ['Tradicional', 'Morango', 'Melancia'],
        imagem: B('monster-tradicional.png'),
        imagens: {
          'Tradicional': B('monster-tradicional.png'),
          'Morango':     B('monster-morango.png'),
          'Melancia':    B('monster-melancia.png'),
        },
      },

      // ── Coca-Cola ────────────────────────────────────────────────
      {
        id: 'coca600', nome: 'Coca-Cola 600ml', subtitulo: 'Garrafa',
        preco: 8.00,
        imagem: B('coca-600.png'),
      },
      {
        id: 'minicoca', nome: 'Mini Coca-Cola', subtitulo: 'Lata 220ml',
        preco: 3.00,
        imagem: B('coca-mini.png'),
      },
      {
        id: 'coca', nome: 'Coca-Cola', subtitulo: 'Lata 350ml',
        preco: 6.00,
        imagem: B('coca-lata.png'),
      },
      {
        id: 'cocazero', nome: 'Coca Zero', subtitulo: 'Lata 350ml',
        preco: 6.00,
        imagem: B('coca-zero.png'),
      },
      {
        id: 'retornavel', nome: 'Retornável', subtitulo: 'Garrafa 2L',
        preco: 8.50, sabores: ['Coca-Cola', 'Coca Zero', 'Fanta Laranja', 'Fanta Uva'],
        imagem: B('coca-retornavel.png'),
      },

      // ── Guaraná / Outros refris ──────────────────────────────────
      {
        id: 'guaranait', nome: 'Guaraná IT', subtitulo: 'Garrafa 2L',
        preco: 6.00, sabores: ['Guaraná', 'Limão'],
        imagem: B('it-guarana.png'),
        imagens: { 'Guaraná': B('it-guarana.png'), 'Limão': B('it-limao.png') },
      },
      {
        id: 'sprite', nome: 'Sprite', subtitulo: 'Lata 350ml',
        preco: 6.00,
        imagem: 'https://pngimg.com/uploads/sprite/sprite_PNG98773.png',
      },
      {
        id: 'fanta', nome: 'Fanta', subtitulo: 'Lata 350ml',
        preco: 6.00, sabores: ['Laranja', 'Uva', 'Maracujá', 'Guaraná'],
        imagem: B('fanta-laranja.png'),
        imagens: {
          'Laranja':  B('fanta-laranja.png'),
          'Uva':      B('fanta-uva.png'),
          'Maracujá': B('fanta-maracuja.png'),
          'Guaraná':  B('fanta-guarana.png'),
        },
      },
      {
        id: 'kuat', nome: 'Kuat', subtitulo: 'Lata 350ml',
        preco: 6.00,
        imagem: 'https://www.nicepng.com/png/full/425-4253486_guarana-2-litros-png-kuat.png',
      },
      {
        id: 'guaravita', nome: 'Guaravita', subtitulo: 'Garrafa 300ml',
        preco: 2.50,
        imagem: B('guaravita.png'),
      },

      // ── Água ─────────────────────────────────────────────────────
      {
        id: 'agcg', nome: 'Água Mineral', subtitulo: 'Com gás 500ml',
        preco: 3.50,
        imagem: B('agua-com-gas.png'),
      },
      {
        id: 'agsg', nome: 'Água Mineral', subtitulo: 'Sem gás 500ml',
        preco: 3.00,
        imagem: B('agua-sem-gas.png'),
      },
      {
        id: 'agua15', nome: 'Água Mineral 1,5L', subtitulo: 'Sem gás',
        preco: 4.00,
        imagem: B('agua-1-5L.png'),
      },
      {
        id: 'tonica', nome: 'Água Tônica', subtitulo: 'Lata / Garrafa',
        preco: 4.50,
        imagem: null,
      },
    ]
  }
]

export const ADICIONAIS = []
