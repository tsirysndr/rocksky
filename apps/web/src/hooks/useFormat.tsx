export const useTimeFormat = () => {
  const formatTime = (millis: number) => {
    let minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    const secondsDisplay = seconds.length === 1 ? `0${seconds}` : seconds;

    if (seconds === "60") {
      minutes += 1;
      return `${minutes < 10 ? `0${minutes}` : minutes}:00`;
    } else {
      return `${minutes < 10 ? `0${minutes}` : minutes}:${secondsDisplay}`;
    }
  };
  // Total-length form for track collections: "2 hr 14 min", "45 min",
  // "58 sec". Seconds only matter below a minute; below an hour, minutes
  // round to the nearest so the sum reads naturally.
  const formatDuration = (millis: number) => {
    const totalSeconds = Math.round(millis / 1000);
    if (totalSeconds < 60) return `${totalSeconds} sec`;
    const totalMinutes = Math.round(totalSeconds / 60);
    if (totalMinutes < 60) return `${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
  };

  return { formatTime, formatDuration };
};
