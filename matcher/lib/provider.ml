type t = {
  name : string;
  candidates : Domain.request -> Domain.candidate list Lwt.t;
  enrich : Domain.candidate -> Domain.candidate Lwt.t;
}

let make ?(enrich = Lwt.return) name candidates = { name; candidates; enrich }
