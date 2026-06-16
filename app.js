document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('textarea').forEach((textarea) => {
    const resize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    };
    textarea.addEventListener('input', resize);
    resize();
  });
});
