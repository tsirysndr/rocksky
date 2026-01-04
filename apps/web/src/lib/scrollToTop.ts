export default function scrollToTop() {
  const container = document.querySelector("#app-container");
  if (container) {
    container.scrollTo({ top: 0, behavior: "smooth" });
  }
}
