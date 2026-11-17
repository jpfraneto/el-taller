// Example conversations for Sebastián's panel (the reel shows it full). Invented people, marked demo: the panel tags
// them "ejemplo", and POST /api/panel/demo {accion:"borrar"} removes them all.
const H = 3600e3;

function proximo(diaSemana, horas) {             // 6 = sábado, 0 = domingo; a date string the way Claude writes it
  const d = new Date(Date.now() - 3 * H);           // Chile is UTC-3
  d.setUTCDate(d.getUTCDate() + ((diaSemana - d.getUTCDay() + 7) % 7 || 7));
  const txt = d.toLocaleDateString('es-CL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  return { txt: `${txt}, ${horas}`, fecha: d.toISOString().slice(0, 10), dia: txt, hora: horas };
}

const conv = (id, horasAtras, o) => {
  const t0 = Date.now() - horasAtras * H;
  return {
    id: `demo-${id}`, demo: true, origen: 'chat', estado: 'nuevo', t0, t1: t0 + 6 * 60e3,
    msgs: o.msgs.map(([r, c], i) => ({ r, c, t: t0 + i * 50e3 })),
    lead: o.lead, temas: o.temas, temperatura: o.temperatura, resumen: o.resumen,
    ...(o.lead.telefono && o.lead.nombre ? { t_lead: t0 + 5 * 60e3 } : {}), ...(o.extra || {}),
  };
};

const TITULOS = { 'vista-volcanes': 'Parcela con vista a los volcanes', 'dos-campos': 'Dos campos de 2,39 hectáreas', 'las-marcas': 'Parcelas entre Puerto Varas y Puerto Montt' };

export function DEMO() {
  return demos().map((c) => (c.lead.parcela ? { ...c, lead: { ...c.lead, parcela_titulo: TITULOS[c.lead.parcela], vendedor: 'Sebastián' } } : c));
}

function demos() {
  const sab = proximo(6, '11:00'), dom = proximo(0, '16:00'), sab2 = proximo(6, '15:00');
  return [
    conv('camila', 0.4, {
      msgs: [
        ['user', 'hola, la parcela con vista a los volcanes sigue disponible?'],
        ['assistant', 'Hola, sí. Son 5.000 m², plana, con bosque nativo, luz, agua APR y portón eléctrico, en Colonia Tres Puentes. ¿La buscas para vivir?'],
        ['user', 'sí, para construir una casa con mi pareja. cuánto vale? se puede con crédito directo?'],
        ['assistant', 'Se puede con crédito directo: le pagas a Sebastián en cuotas, sin banco. El precio lo da él según la forma de pago. ¿Me dejas tu nombre y tu WhatsApp y te lo manda hoy?'],
        ['user', 'Camila, +56 9 4411 2233. y podemos ir a verla el sábado en la mañana?'],
        ['assistant', `Listo, Camila. Te anoto para el ${sab.txt}. Sebastián te escribe para mandarte el precio y confirmar la visita.`],
      ],
      lead: { nombre: 'Camila', telefono: '56944112233', parcela: 'vista-volcanes', busca: 'Vivir, construir casa con su pareja', visita: sab.txt, credito: 'sí' },
      temas: ['precio', 'credito', 'visita'], temperatura: 'caliente',
      resumen: 'Pareja que quiere construir su casa. Pide precio con crédito directo y va el sábado a las 11.',
      extra: { visita: { parcela: 'vista-volcanes', dia: sab.dia, fecha: sab.fecha, hora: sab.hora } },
    }),
    conv('rodrigo', 3, {
      msgs: [
        ['user', 'Buenas, me interesan los dos terrenos de 2,39 ha. Es para un proyecto de cabañas'],
        ['assistant', 'Buenas. Son dos terrenos de 2,39 ha cada uno, en Colonia Tres Puentes / Metrenquen, con rol propio, acceso pavimentado, luz y agua APR. Sebastián los ofrece justamente para proyecto turístico. ¿Te interesan los dos juntos?'],
        ['user', 'los dos, sí. se pueden subdividir después?'],
        ['assistant', 'Eso no te lo quiero inventar: lo de subdividir te lo confirma Sebastián. ¿Te escribe él? Déjame tu nombre y WhatsApp.'],
        ['user', 'Rodrigo 98877 6655'],
        ['assistant', 'Gracias, Rodrigo. Sebastián te escribe por WhatsApp con lo de la subdivisión y el precio de los dos.'],
      ],
      lead: { nombre: 'Rodrigo', telefono: '56998877665', parcela: 'dos-campos', busca: 'Los dos terrenos, para cabañas', visita: '', credito: '' },
      temas: ['subdivision', 'precio', 'tamano'], temperatura: 'caliente',
      resumen: 'Quiere los DOS terrenos para cabañas. Pregunta si se pueden subdividir. Respóndele eso primero.',
    }),
    conv('anon1', 7, {
      msgs: [
        ['user', 'cuanto cuesta la de las marcas'],
        ['assistant', 'El precio lo da Sebastián según la forma de pago (tiene crédito directo). ¿Te lo mando a pedir? Solo necesito tu WhatsApp.'],
        ['user', 'no gracias solo estaba viendo'],
        ['assistant', 'Dale, cuando quieras. Las de Las Marcas son de 5.000 m², planas, con estero y bosque nativo.'],
      ],
      lead: { parcela: 'las-marcas' }, temas: ['precio'], temperatura: 'curioso',
      resumen: 'Preguntó el precio de Las Marcas y se fue sin dejar datos.',
    }),
    conv('familia', 20, {
      msgs: [
        ['user', 'Hola! Tienen fotos de las parcelas de Las Marcas? solo veo un plano'],
        ['assistant', 'Por ahora en la página hay el plano y la vista satelital. Sebastián te puede mandar fotos por WhatsApp. ¿Te las pido?'],
        ['user', 'ya, soy Paula, mi wsp es 9 5566 7788. Queremos ir el domingo en la tarde con mi familia'],
        ['assistant', `Perfecto, Paula. Te anoto para el ${dom.txt}. Sebastián te manda las fotos y te confirma.`],
      ],
      lead: { nombre: 'Paula', telefono: '56955667788', parcela: 'las-marcas', busca: 'Familia, quiere ver fotos antes', visita: dom.txt, credito: '' },
      temas: ['fotos', 'visita'], temperatura: 'caliente',
      resumen: 'Familia. Pide fotos de Las Marcas antes de ir el domingo a las 16:00.',
      extra: { visita: { parcela: 'las-marcas', dia: dom.dia, fecha: dom.fecha, hora: dom.hora } },
    }),
    conv('anon2', 26, {
      msgs: [
        ['user', 'tienen agua y luz?'],
        ['assistant', 'Sí, todas tienen luz y agua potable rural (APR). ¿Cuál te interesa?'],
        ['user', 'la de los volcanes. a cuantos minutos queda de puerto varas?'],
        ['assistant', 'Tiene buena conexión por camino pavimentado, pero los minutos exactos te los dice Sebastián. ¿Quieres que te escriba?'],
      ],
      lead: { parcela: 'vista-volcanes' }, temas: ['agua_luz', 'ubicacion'], temperatura: 'tibio',
      resumen: 'Pregunta cuánto queda de Puerto Varas. No dejó datos.',
    }),
    conv('anon3', 31, {
      msgs: [
        ['user', 'precio parcela 5000 mts?'],
        ['assistant', 'El precio te lo da Sebastián, con crédito directo si quieres. ¿Te lo mando a pedir?'],
      ],
      lead: {}, temas: ['precio'], temperatura: 'curioso', resumen: 'Preguntó el precio, sin datos.',
    }),
    conv('jorge', 44, {
      msgs: [
        ['user', 'hola, como funciona el credito directo? cuanto es el pie?'],
        ['assistant', 'Le pagas a Sebastián en cuotas, sin banco. El pie y el plazo los conversa él contigo. ¿Te escribe?'],
        ['user', 'ok. Marcelo +56 9 7123 4567. quiero ver los terrenos grandes'],
        ['assistant', `Gracias, Marcelo. Te anoto para el ${sab2.txt} para ver los terrenos de 2,39 ha. Sebastián te confirma.`],
      ],
      lead: { nombre: 'Marcelo', telefono: '56971234567', parcela: 'dos-campos', busca: 'Mini campo', visita: sab2.txt, credito: 'sí' },
      temas: ['credito', 'visita'], temperatura: 'caliente',
      resumen: 'Quiere crédito directo: pregunta por el pie. Va a ver los terrenos grandes.',
      extra: { estado: 'contactado', visita: { parcela: 'dos-campos', dia: sab2.dia, fecha: sab2.fecha, hora: sab2.hora } },
    }),
  ];
}

// A company that wants the sponsor slot (an example: the panel tags it "ejemplo").
export function AUSPICIO_DEMO() {
  return { empresa: 'Casas modulares (ejemplo)', nombre: 'Francisca', telefono: '56944556677',
    que: 'Hacemos casas prefabricadas en el sur. Queremos aparecer frente a la gente que está comprando terreno.', t: Date.now() - 7 * H, estado: 'nuevo', demo: true };
}
