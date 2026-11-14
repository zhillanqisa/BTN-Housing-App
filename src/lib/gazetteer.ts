// Tempat contoh per wilayah untuk pencarian luring dan kartu lokasi contoh. Datanya ada di wilayah.ts.
import { wilayahById, type IdWilayah, type Tempat } from './wilayah'

export type { Tempat } from './wilayah'

export const tempatWilayah = (id: IdWilayah): Tempat[] => wilayahById(id)?.tempat ?? []
export const sorotanWilayah = (id: IdWilayah): Tempat[] => tempatWilayah(id).filter((t) => t.sorotan)
