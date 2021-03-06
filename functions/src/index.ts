import * as functions from "firebase-functions";
import fetch from "node-fetch";
import * as dateFormat from "dateformat";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

type ExpData = {
    name: string,
    vocation: string,
    exp: number
};

const fetchAllProfessions: () => Promise<ExpData[]> = async () => {
  const professions = ["knight", "paladin", "druid", "sorcerer"]
      .map(fetchProfession);

  const results = await Promise.all(professions);
  return results.reduce((a, b) => a.concat(b));
};

const fetchProfession: (profession: string) => Promise<ExpData[]> =
  async (profession: string) => {
    const url = `https://api.tibiadata.com/v2/highscores/Peloria/exp/${profession}.json`;
    console.log(url);
    return fetch(url).then((res) => res.json())
        .then((res) => res.highscores.data)
        .then((data) => {
          if (data.error) {
            console.error(
                `Failed to fetch profession ${profession}: ${data.error}`);
            return [];
          }

          return data;
        })
        .then((rows: any[]) => rows.map((row) =>
          ({name: row.name, vocation: row.vocation, exp: row.value})));
  };

const updateExp = async () => {
  const batchSize = 500;
  const date = dateFormat(new Date(), "yyyy-mm-dd");
  const res = await fetchAllProfessions();

  while (res.length > 0) {
    const batchRecords = res.splice(0, batchSize);
    console.log(`Inserting batch of size ${batchRecords.length}`);

    const batch = db.batch();
    batchRecords.forEach(
        (val) => batch.set(db.doc(`date/${date}/char/${val.name}`), val));
    await batch.commit();
  }

  await db.doc("metadata/lastScan")
      .set({time: dateFormat(new Date(), "yyyy-mm-dd HH:MM")});
};

exports.forceUpdateExperience = functions.https.onRequest(async (req, res) => {
  updateExp().finally(() => res.end());
});

exports.updateExperience = functions.pubsub
    .schedule("*/15 * * * * ")
    .onRun(async (context) => {
      await updateExp();
    });
