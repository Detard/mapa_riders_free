// =========================================
// 1. CONFIGURAÇÃO E DADOS
// =========================================

// Mapeamento: Arquivo GeoJSON -> Ícone
const configuracaoCamadas = [
    { arquivo: 'barragem_pi.geojson', tipo: 'Barragem', icone: 'barragem.svg' },
    { arquivo: 'bens_tombados_pi.geojson', tipo: 'Bem Tombado', icone: 'bens_tombados.svg' },
    { arquivo: 'cachoeiras_pi.geojson', tipo: 'Cachoeira', icone: 'cachoerias.svg' }, 
    { arquivo: 'delta_do_rio_parnaiba_pi.geojson', tipo: 'Delta', icone: 'delta_do_rio_parnaiba.svg' },
    { arquivo: 'ecoturismo_pi.geojson', tipo: 'Ecoturismo', icone: 'parque.svg' }, 
    { arquivo: 'museu_pi.geojson', tipo: 'Museu', icone: 'museu.svg' },
    { arquivo: 'parques_pi.geojson', tipo: 'Parque', icone: 'parque.svg' },
    { arquivo: 'praias_pi.geojson', tipo: 'Praia', icone: 'praia.svg' },
    { arquivo: 'serra_da_capivara_pi.geojson', tipo: 'Patrimônio', icone: 'serra_da_capivara.svg' }
    // Futuro: 'viagens_grupo.geojson' -> 'riders_free.svg'
];

// Estados que podem ser carregados sob demanda
const estadosVizinhos = ['MA', 'CE', 'PE', 'BA', 'TO']; 

// =========================================
// 2. INICIALIZAÇÃO DO MAPA
// =========================================

var initialBounds = [[-12, -48], [-2, -38]]; // Foco no PI aproximado

const map = L.map('map', {
    zoomControl: false,
    maxZoom: 18,
    minZoom: 5
}).fitBounds(initialBounds);

var hash = new L.Hash(map);

// Camadas Base
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
});

const satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: '© Google Maps'
});

osmLayer.addTo(map); // Padrão

// Controle Externo (Botões do Menu)
window.trocarCamadaBase = function(tipo) {
    if (tipo === 'mapa') {
        map.addLayer(osmLayer);
        map.removeLayer(satelliteLayer);
    } else if (tipo === 'satelite') {
        map.addLayer(satelliteLayer);
        map.removeLayer(osmLayer);
    }
};

// =========================================
// 3. ESTILOS E ÍCONES
// =========================================

// Função para criar Ícones (Tamanho Reduzido)
function criarIcone(nomeArquivoSvg) {
    return L.icon({
        iconUrl: `icones/icones_camadas/${nomeArquivoSvg}`,
        iconSize: [22, 22],   // Reduzido de 32x32 para 22x22
        iconAnchor: [11, 22], // Ajustado o pino (metade da largura, fundo da altura)
        popupAnchor: [0, -22] // Onde o balão abre (logo acima do ícone)
    });
}

// Estilo dos Estados (Municípios)
function styleEstados(feature) {
    // Se for Piauí (código 22 ou propriedade específica), cor diferente
    // Aqui assumimos que PI.geojson é o base carregado
    const isPiaui = true; // Por enquanto só carregamos PI explicitamente

    return {
        fillColor: isPiaui ? '#1a1a1a' : '#555555', // PI mais escuro/destacado, outros cinza
        weight: 1,
        opacity: 1,
        color: 'white', // Borda branca
        fillOpacity: 0.1 // Transparência alta para ver o mapa base
    };
}

// =========================================
// 4. CARREGAMENTO DE DADOS (AGRUPAMENTO MINIMIZADO)
// =========================================

window.clusterPontos = L.markerClusterGroup({
    // --- CONFIGURAÇÃO PARA QUASE NÃO AGRUPAR ---
    maxClusterRadius: 15,       // Padrão é 80. Com 20, só agrupa se estiverem "colados".
    spiderfyOnMaxZoom: true,    // Importante: Se dois pontos tiverem a MESMA coordenada, ele abre em "aranha" ao clicar.
    showCoverageOnHover: false, // Remove a área azul ao passar o mouse (estética mais limpa).
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 8 // A partir do zoom 10 (nível regional), desativa agrupamento totalmente.
});

map.addLayer(window.clusterPontos);

// Carregar PI.geojson (Base)
fetch('data/PI.geojson')
    .then(res => res.json())
    .then(data => {
        L.geoJSON(data, {
            style: styleEstados,
            onEachFeature: function(feature, layer) {
                // Tooltip simples com nome do município
                if(feature.properties && (feature.properties.nm_mun || feature.properties.NM_MUN)) {
                   layer.bindTooltip(feature.properties.nm_mun || feature.properties.NM_MUN, {
                       direction: 'center', className: 'lbl-municipio'
                   });
                }
            }
        }).addTo(map);
    })
    .catch(err => console.error("Erro ao carregar PI.geojson", err));

// Carregar Camadas de Pontos Turísticos
const promises = configuracaoCamadas.map(camada => 
    fetch(`data/${camada.arquivo}`)
        .then(res => {
            if(!res.ok) throw new Error(`Falha em ${camada.arquivo}`);
            return res.json();
        })
        .then(geojson => {
            return { geojson, config: camada };
        })
        .catch(err => {
            console.warn(`Arquivo não encontrado ou erro: ${camada.arquivo}`);
            return null;
        })
);

Promise.all(promises).then(resultados => {
    resultados.forEach(item => {
        if(!item) return;

        const layer = L.geoJSON(item.geojson, {
            pointToLayer: function(feature, latlng) {
                return L.marker(latlng, { 
                    icon: criarIcone(item.config.icone) 
                });
            },
            onEachFeature: function(feature, layer) {
                configurarPopup(feature, layer, item.config.tipo);
            }
        });
        window.clusterPontos.addLayer(layer);
    });
});

// =========================================
// 5. POPUP E INTERAÇÃO SIDEBAR
// =========================================

function configurarPopup(feature, layer, tipoCategoria) {
    const p = feature.properties;
    // Tenta achar nome e descrição em propriedades comuns variadas
    const nome = p.nome || p.NOME || p.Name || "Local sem nome";
    const desc = p.descricao || p.description || p.municipio || "";
    
    // Armazena dados globalmente para sidebar acessar se precisar (para edição no admin)
    const idUnico =  L.Util.stamp(layer);
    window.dadosLocais = window.dadosLocais || {};
    window.dadosLocais[idUnico] = { ...p, tipoCategoria, nome };

    const html = `
        <div style="font-family: 'Segoe UI'; min-width: 200px;">
            <strong style="color: #1a1a1a; font-size: 14px; text-transform: uppercase;">${tipoCategoria}</strong>
            <h3 style="margin: 5px 0; color: #333;">${nome}</h3>
            <p style="margin: 5px 0; color: #666;">${desc}</p>
            <button onclick="window.abrirDetalhesSidebar('${idUnico}')" 
                style="background: #1a1a1a; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 5px;">
                Ver Detalhes
            </button>
        </div>
    `;
    layer.bindPopup(html);
}

// Função chamada pelo botão do Popup
window.abrirDetalhesSidebar = function(id) {
    const dados = window.dadosLocais[id];
    if (!dados) return;

    if (window.parent && window.parent.document) {
        const docPai = window.parent.document;
        
        // Abre sidebar
        const sidebar = docPai.getElementById('sidebar-container');
        sidebar.classList.remove('closed');
        
        // Ativa aba correta
        docPai.querySelectorAll('.icon-item').forEach(i => i.classList.remove('active'));
        docPai.querySelector('[data-target="panel-locais"]').classList.add('active');
        
        docPai.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
        docPai.getElementById('panel-locais').classList.add('active');

        // Preenche HTML
        const divConteudo = docPai.getElementById('conteudo-detalhes');
        
        let htmlContent = `
            <div class="detalhe-item">
                <strong>Nome</strong>
                <span>${dados.nome}</span>
            </div>
            <div class="detalhe-item">
                <strong>Categoria</strong>
                <span>${dados.tipoCategoria}</span>
            </div>
        `;
        
        // Renderiza outras propriedades genéricas
        for (let key in dados) {
            if(['nome', 'tipoCategoria', 'id', 'fid', 'geometry'].includes(key)) continue;
            htmlContent += `
                <div class="detalhe-item">
                    <strong>${key.replace(/_/g, " ")}</strong>
                    <span>${dados[key]}</span>
                </div>
            `;
        }

        divConteudo.innerHTML = htmlContent;
    }
};