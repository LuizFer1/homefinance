/**
 * Lado final do avatar, em pixels.
 *
 * O avatar é exibido em 36–72px e sempre circular. 96 cobre telas de 2x sem
 * gastar bytes num detalhe que ninguém enxerga — e cada byte aqui viaja na linha
 * do perfil em todo sync.
 */
export const AVATAR_SIZE = 96;

/**
 * Teto do data URI, em caracteres.
 *
 * O data URI é ASCII, então caractere e byte coincidem, e é o comprimento desta
 * string que de fato entra na linha do perfil e viaja em todo sync.
 */
export const AVATAR_MAX_CHARS = 6 * 1024;

/**
 * Qualidades tentadas, da melhor para a pior. Três degraus: o primeiro resolve
 * a foto já pequena, o último é a última chance antes de recusar.
 */
const QUALITIES = [0.8, 0.6, 0.45] as const;

export interface Crop {
  x: number;
  y: number;
  size: number;
}

/**
 * O mínimo que o pipeline precisa saber da imagem decodificada.
 *
 * `ImageBitmap` satisfaz esta forma estruturalmente, então o codificador de
 * navegador recebe o bitmap de verdade sem nenhum cast, e o teste passa um
 * objeto literal sem precisar de canvas.
 */
export interface AvatarSource {
  width: number;
  height: number;
}

export interface AvatarDeps {
  decode: (file: Blob) => Promise<AvatarSource>;
  encode: (source: AvatarSource, crop: Crop, size: number, quality: number) => Promise<string>;
}

/**
 * Recorte quadrado central, em vez de um editor com pinça e zoom.
 *
 * O editor é a feature mais cara desta fatia e a que menos muda o resultado num
 * avatar de 36px sempre circular.
 */
export function squareCrop(width: number, height: number): Crop {
  const size = Math.min(width, height);
  return {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    size,
  };
}

/**
 * Devolve o data URI pronto para gravar, ou lança.
 *
 * Lançar é a resposta certa para a foto que não cabe: gravar a versão gigante
 * incharia a linha do perfil, que viaja inteira em todo sync (LWW por linha), e
 * devolver `null` em silêncio faria o usuário concluir que a foto foi salva.
 *
 * Decodifica **uma vez** e reusa a fonte nas três tentativas: decodificar por
 * qualidade multiplicaria por três o trabalho mais caro do pipeline.
 */
export async function processAvatar(file: Blob, deps: AvatarDeps): Promise<string> {
  const source = await deps.decode(file);
  const crop = squareCrop(source.width, source.height);

  for (const quality of QUALITIES) {
    const uri = await deps.encode(source, crop, AVATAR_SIZE, quality);
    if (uri.length <= AVATAR_MAX_CHARS) return uri;
  }

  throw new Error("Essa imagem e grande demais. Tente uma foto mais simples ou menor.");
}
