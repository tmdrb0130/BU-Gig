import { Database } from "./db";
import { taxonomy } from "./taxonomy-data";
import { hash } from "./shared";
export async function seedTaxonomy(db: Database) {
  await db.tx(async (q) => {
    let position = 0;
    for (const [category, groups] of Object.entries(taxonomy)) {
      const cid = `c_${hash(category).slice(0, 12)}`;
      await q.query(
        "INSERT INTO categories(id,label,position) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [cid, category, position++],
      );
      for (const [group, labels] of Object.entries(groups))
        for (const label of labels) {
          const fid = `f_${hash(category + ":" + label).slice(0, 12)}`;
          await q.query(
            "INSERT INTO service_fields(id,category_id,label,group_label) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [fid, cid, label, group],
          );
        }
    }
    for (const label of [
      "Figma",
      "Illustrator",
      "Photoshop",
      "React",
      "Premiere Pro",
      "영문 번역",
      "Excel",
    ])
      await q.query(
        "INSERT INTO skills(id,label,aliases) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [label.toLowerCase().replace(/ /g, "-"), label, [label.toLowerCase()]],
      );
  });
}
