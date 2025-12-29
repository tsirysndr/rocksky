import * as afrobeat from "./afrobeat.ts";
import * as afrobeats from "./afrobeats.ts";
import * as all from "./all.ts";
import * as alternativeMetal from "./alternative-metal.ts";
import * as alternativeRnb from "./alternative-rnb.ts";
import * as anime from "./anime.ts";
import * as artPop from "./art-pop.ts";
import * as breakcore from "./breakcore.ts";
import * as chicagoDrill from "./chicago-drill.ts";
import * as chillwave from "./chillwave.ts";
import * as countryHipHop from "./country-hip-hop.ts";
import * as crunk from "./crunk.ts";
import * as dancePop from "./dance-pop.ts";
import * as deepHouse from "./deep-house.ts";
import * as drill from "./drill.ts";
import * as dubstep from "./dubstep.ts";
import * as emo from "./emo.ts";
import * as grunge from "./grunge.ts";
import * as hardRock from "./hard-rock.ts";
import * as heavyMetal from "./heavy-metal.ts";
import * as hipHop from "./hip-hop.ts";
import * as house from "./house.ts";
import * as hyperpop from "./hyperpop.ts";
import * as indie from "./indie.ts";
import * as indieRock from "./indie-rock.ts";
import * as jpop from "./j-pop.ts";
import * as jrock from "./j-rock.ts";
import * as jazz from "./jazz.ts";
import * as kpop from "./k-pop.ts";
import * as lofi from "./lo-fi.ts";
import * as metal from "./metal.ts";
import * as metalcore from "./metalcore.ts";
import * as midwestEmo from "./midwest-emo.ts";
import * as numetal from "./nu-metal.ts";
import * as popPunk from "./pop-punk.ts";
import * as postGrunge from "./post-grunge.ts";
import * as rap from "./rap.ts";
import * as rapMetal from "./rap-metal.ts";
import * as rnb from "./rnb.ts";
import * as rock from "./rock.ts";
import * as southernHipHop from "./southern-hip-hop.ts";
import * as speedcore from "./speedcore.ts";
import * as synthwave from "./synthwave.ts";
import * as swedishPop from "./swedish-pop.ts";
import * as thrashMetal from "./thrash-metal.ts";
import * as trap from "./trap.ts";
import * as trapSoul from "./trap-soul.ts";
import * as tropicalHouse from "./tropical-house.ts";
import * as vaporwave from "./vaporwave.ts";
import * as visualKei from "./visual-kei.ts";
import * as vocaloid from "./vocaloid.ts";
import * as westCoastHipHop from "./west-coast-hip-hop.ts";
import { Algorithm } from "./types.ts";

const algos: Algorithm[] = [
  afrobeat.info,
  afrobeats.info,
  all.info,
  alternativeMetal.info,
  alternativeRnb.info,
  anime.info,
  artPop.info,
  breakcore.info,
  chicagoDrill.info,
  chillwave.info,
  countryHipHop.info,
  crunk.info,
  dancePop.info,
  deepHouse.info,
  drill.info,
  dubstep.info,
  emo.info,
  grunge.info,
  hardRock.info,
  heavyMetal.info,
  hipHop.info,
  house.info,
  hyperpop.info,
  indie.info,
  indieRock.info,
  jpop.info,
  jrock.info,
  jazz.info,
  kpop.info,
  lofi.info,
  metal.info,
  metalcore.info,
  midwestEmo.info,
  numetal.info,
  popPunk.info,
  postGrunge.info,
  rap.info,
  rapMetal.info,
  rnb.info,
  rock.info,
  southernHipHop.info,
  speedcore.info,
  synthwave.info,
  swedishPop.info,
  thrashMetal.info,
  trap.info,
  trapSoul.info,
  tropicalHouse.info,
  vaporwave.info,
  visualKei.info,
  vocaloid.info,
  westCoastHipHop.info,
];

export function getAlgo(publisherDid: string, rkey: string) {
  for (const algo of algos) {
    if (algo.rkey === rkey && algo.publisherDid === publisherDid) {
      return algo;
    }
  }
  return null;
}

export default algos;
