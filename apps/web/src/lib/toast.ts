import iziToast, { type IziToastSettings } from "izitoast";
import "izitoast/dist/css/iziToast.min.css";

const BASE: IziToastSettings = {
  position: "topRight",
  layout: 2,
  close: true,
  pauseOnHover: true,
  progressBar: true,
  drag: false,
};

export const notify = {
  success(message: string) {
    iziToast.success({ ...BASE, title: "Pronto", message, timeout: 4_000 });
  },
  info(message: string) {
    iziToast.info({ ...BASE, title: "Aviso", message, timeout: 6_000 });
  },
  error(message: string) {
    iziToast.error({ ...BASE, title: "Não foi possível concluir", message, timeout: 8_000 });
  },
};
