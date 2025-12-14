// =========================================
// 1. LINKS DAS PLANILHAS
// =========================================
const URL_PLANILHA_VIAGENS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQavLOwuqDZaqsPmsr7MaDYKp-FYNq2cNXLtxeFLr3ruunBhmY8TBRlHycwXiicnzDAK9HNT2ZNwcxK/pub?gid=0&single=true&output=csv";
const URL_PLANILHA_PONTOS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQavLOwuqDZaqsPmsr7MaDYKp-FYNq2cNXLtxeFLr3ruunBhmY8TBRlHycwXiicnzDAK9HNT2ZNwcxK/pub?gid=2127162117&single=true&output=csv";

// =========================================
// 2. CONFIGURAÇÃO DE ÍCONES
// =========================================
const iconMap = {
    'Viagem Realizada': 'riders_free.svg',
    'Hotel': 'hotel.svg',
    'Cachoeira': 'cachoerias.svg',
    'Barragem': 'barragem.svg',
    'Praia': 'praia.svg',
    'Parque': 'parque.svg',
    'Delta': 'delta_do_rio_parnaiba.svg',
    'Museu': 'museu.svg',
    'Bem Tombado': 'bens_tombados.svg',
    'Serra da Capivara': 'serra_da_capivara.svg',
    'Balneário': 'parque.svg',
    'Outros': 'outros_locais.svg'
};

// =========================================
// 3. MAPA E INICIALIZAÇÃO
// =========================================
var initialBounds = [[-12, -48], [-2, -38]]; 
const map = L.map('map', { zoomControl: false, maxZoom: 18, minZoom: 5 }).fitBounds(initialBounds);
var hash = new L.Hash(map);

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' });
const satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { attribution: '© Google Maps' });
osmLayer.addTo(map);

window.trocarCamadaBase = function(tipo) {
    if (tipo === 'mapa') { map.addLayer(osmLayer); map.removeLayer(satelliteLayer); } 
    else { map.addLayer(satelliteLayer); map.removeLayer(osmLayer); }
};

// =========================================
// 4. CAMADAS (LAYERS)
// =========================================
const layers = {};
const clusterConfig = {
    maxClusterRadius: 15, spiderfyOnMaxZoom: true, showCoverageOnHover: false, disableClusteringAtZoom: 8
};

for (let key in iconMap) {
    layers[key] = L.markerClusterGroup(clusterConfig);
}

// Inicializa a camada de viagens
if(layers['Viagem Realizada']) {
    map.addLayer(layers['Viagem Realizada']);
}

window.toggleLayer = function(nomeCategoria, checked) {
    const layerAlvo = layers[nomeCategoria];
    if (layerAlvo) {
        if (checked) map.addLayer(layerAlvo);
        else map.removeLayer(layerAlvo);
    }
};

// =========================================
// 5. FUNÇÕES AUXILIARES
// =========================================

function criarIcone(nomeArquivo) {
    return L.icon({
        iconUrl: `icones/icones_camadas/${nomeArquivo}`,
        iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -22]
    });
}

function csvToJSON(csvText) {
    const lines = csvText.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ''));
    return lines.slice(1).map(line => {
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));
        let obj = {}; headers.forEach((header, i) => { obj[header] = values[i] || ""; });
        return obj;
    });
}

function converterLinkDrive(url, tamanho = 'w1000') {
    if (!url) return "";
    if (!url.includes('drive.google.com')) return url;
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
        const id = match[1];
        return `https://drive.google.com/thumbnail?id=${id}&sz=${tamanho}`;
    }
    return url;
}

// =========================================
// 6. GESTÃO DE ESTADOS (.GEOJSON) - NOVO!
// =========================================
const estadosCarregados = new Set(); // Evita carregar o mesmo estado 2x

function carregarFronteira(uf) {
    // Normaliza para garantir que é sigla (ex: "PI", "MA")
    const sigla = uf.trim().toUpperCase();
    
    // Se não for sigla válida ou já tiver carregado, ignora
    if (sigla.length !== 2 || estadosCarregados.has(sigla)) return;

    // Marca como carregado para não repetir
    estadosCarregados.add(sigla);

    const url = `data/${sigla}.geojson`;

    // Define o estilo: PI tem destaque, os outros são discretos
    const estilo = (sigla === 'PI') 
        ? { fillColor: '#1a1a1a', weight: 1.5, color: 'white', fillOpacity: 0.15 } // Estilo do PI (Destaque)
        : { fillColor: '#555555', weight: 1, color: '#888', fillOpacity: 0.1 };   // Estilo dos Outros

    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error("Arquivo não encontrado");
            return response.json();
        })
        .then(data => {
            // Adiciona ao mapa com o estilo definido e joga para trás (back) para não cobrir marcadores
            const layer = L.geoJSON(data, { 
                style: estilo, 
                interactive: false // Não atrapalha o clique no mapa
            }).addTo(map);
            
            layer.bringToBack(); // Garante que fica atrás dos ícones
        })
        .catch(err => {
            console.log(`Não foi possível carregar o mapa de: ${sigla} (Arquivo data/${sigla}.geojson não existe?)`);
        });
}

// =========================================
// 7. CARREGAMENTO DE DADOS (ATUALIZADO)
// =========================================

function carregarDadosGoogle(url, tipoOrigem) {
    if(!url || url.includes("COLE_O_LINK")) return;

    fetch(url).then(r => r.text()).then(csvText => {
        const dados = csvToJSON(csvText);
        dados.forEach(d => {
            
            // --- NOVA LÓGICA: Carrega mapa do estado baseado na coluna UF ---
            // Só faz isso se estivermos lendo a planilha de VIAGENS (para não duplicar lógica)
            if (tipoOrigem === 'Viagem' && d['UF']) {
                carregarFronteira(d['UF']);
            }
            // -------------------------------------------------------------

            let lat = parseFloat(d['Latitude']?.replace(',', '.'));
            let lng = parseFloat(d['Longitude']?.replace(',', '.'));

            if (!isNaN(lat) && !isNaN(lng)) {
                let rawCat = d['Classificação'] || tipoOrigem || "";
                let lowerCat = rawCat.toLowerCase().trim();
                let cat = 'Outros';

                if(tipoOrigem === 'Viagem') cat = 'Viagem Realizada';
                else if (lowerCat.includes('delta')) cat = 'Delta';
                else if (lowerCat.includes('serra da capivara') || lowerCat.includes('patrimônio') || lowerCat.includes('patrimonio')) cat = 'Serra da Capivara';
                else if (lowerCat.includes('balneário') || lowerCat.includes('balneario')) cat = 'Balneário';
                else if (lowerCat.includes('parque') || lowerCat.includes('ecoturismo') || lowerCat.includes('reserva') || lowerCat.includes('lagoa') || lowerCat.includes('cânion')) cat = 'Parque';
                else if (lowerCat.includes('cachoeira')) cat = 'Cachoeira';
                else if (lowerCat.includes('barragem') || lowerCat.includes('açude') || lowerCat.includes('acude')) cat = 'Barragem';
                else if (lowerCat.includes('museu')) cat = 'Museu';
                else if (lowerCat.includes('praia')) cat = 'Praia';
                else if (lowerCat.includes('tombado') || lowerCat.includes('histórico')) cat = 'Bem Tombado';
                else if (lowerCat.includes('hotel') || lowerCat.includes('pousada')) cat = 'Hotel';
                
                if (!layers[cat]) cat = 'Outros';

                let nomeIcone = iconMap[cat] || 'outros_locais.svg';

                const marker = L.marker([lat, lng], {
                    icon: criarIcone(nomeIcone),
                    zIndexOffset: (cat === 'Viagem Realizada') ? 1000 : 0
                });

                marker.dadosLocais = { ...d, origem: tipoOrigem, categoria_final: cat };
                
                marker.bindPopup(`
                    <div style="font-family:'Segoe UI'; min-width:200px;">
                        <strong style="color:#1a1a1a; font-size:12px;">${cat}</strong>
                        <h3 style="margin:5px 0; color:#333;">${d['Nome do Lugar']}</h3>
                        <button onclick="window.abrirDetalhesMarker(this)" style="background:#1a1a1a; color:white; width:100%; border:none; padding:6px; border-radius:4px; margin-top:5px; cursor:pointer;">Ver Detalhes</button>
                    </div>
                `);
                marker.on('popupopen', () => { window.markerAtual = marker; });

                if (layers[cat]) layers[cat].addLayer(marker);
            }
        });
    });
}

carregarDadosGoogle(URL_PLANILHA_VIAGENS, 'Viagem');
carregarDadosGoogle(URL_PLANILHA_PONTOS, 'Ponto Turístico');

// =========================================
// 8. SIDEBAR E DETALHES
// =========================================

window.abrirDetalhesMarker = function(btn) {
    if (window.markerAtual && window.markerAtual.dadosLocais) window.abrirDetalhesSidebar(window.markerAtual.dadosLocais);
};

window.abrirDetalhesSidebar = function(dados) {
    const docPai = window.parent.document;
    const sidebar = docPai.getElementById('sidebar-container');
    sidebar.classList.remove('closed');
    
    docPai.querySelectorAll('.icon-item').forEach(i => i.classList.remove('active'));
    docPai.querySelector('[data-target="panel-locais"]').classList.add('active');
    docPai.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
    docPai.getElementById('panel-locais').classList.add('active');

    const divConteudo = docPai.getElementById('conteudo-detalhes');
    
    let htmlSocial = '';
    const socialLink = dados['Rede Social do Local'];
    if (socialLink && socialLink.length > 5) {
        let btnClass = '';
        if(socialLink.includes('instagram.com')) btnClass = 'btn-social-insta';
        else if(socialLink.includes('facebook.com')) btnClass = 'btn-social-face';
        if(btnClass) {
            htmlSocial = `<a href="${socialLink}" target="_blank" class="btn-social ${btnClass}" title="Rede Social" style="width:24px; height:24px;"></a>`;
        }
    }

    let html = `
        <div style="margin-bottom:15px;">
            <span style="background:#eee; color:#555; padding:2px 8px; border-radius:4px; font-size:11px; text-transform:uppercase;">${dados.categoria_final}</span>
            <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px;">
                <h2 style="color:#1a1a1a; margin:0; font-size:22px; line-height: 1.2;">${dados['Nome do Lugar']}</h2>
                ${htmlSocial}
            </div>
            <p style="color:#666; font-size:14px; margin-top:4px;">📍 ${dados['Cidade']} - ${dados['UF']}</p>
        </div>
    `;

    const linkFotos = dados['Link Fotos Drive'];
    if (linkFotos && linkFotos.length > 5) {
        if (linkFotos.includes(',')) {
            const urls = linkFotos.split(',');
            html += `<div class="carousel-container">`;
            
            const listaLinksLimpos = [];
            urls.forEach(u => {
                const limpo = u.trim();
                if(limpo) listaLinksLimpos.push(converterLinkDrive(limpo, 'w3000')); 
            });
            const listaJSON = JSON.stringify(listaLinksLimpos).replace(/"/g, '&quot;');

            urls.forEach((rawUrl, index) => {
                const urlLimpa = rawUrl.trim();
                if(urlLimpa) {
                    const srcThumb = converterLinkDrive(urlLimpa, 'w500');
                    html += `
                        <img 
                            src="${srcThumb}" 
                            class="carousel-img" 
                            referrerpolicy="no-referrer" 
                            onclick="window.parent.abrirGaleria('${listaJSON}', ${index}, '${dados['Nome do Lugar']}')"
                        >
                    `;
                }
            });
            html += `</div><p style="font-size:11px; color:#888; text-align:center; margin-top:-15px; margin-bottom:20px;">(Clique para abrir a galeria)</p>`;
        
        } else {
            const urlLimpa = linkFotos.trim();
            if(urlLimpa.includes('/file/d/')) {
                 const srcThumb = converterLinkDrive(urlLimpa, 'w800');
                 const srcFull = converterLinkDrive(urlLimpa, 'w3000');
                 const listaJSON = JSON.stringify([srcFull]).replace(/"/g, '&quot;');

                 html += `
                    <div style="text-align:center; margin-bottom:15px;">
                        <img 
                            src="${srcThumb}" 
                            class="carousel-img" 
                            style="width:100%; height:auto; max-height:200px;" 
                            referrerpolicy="no-referrer" 
                            onclick="window.parent.abrirGaleria('${listaJSON}', 0, '${dados['Nome do Lugar']}')"
                        >
                    </div>`;
            } else {
                html += `
                    <a href="${linkFotos}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:10px; background:#0352AA; color:white; text-decoration:none; padding:12px; border-radius:8px; margin-bottom:20px; font-weight:bold;">
                        <img src="icones/icones_menu/camera.png" style="width:20px; filter:brightness(0) invert(1);"> Ver Álbum de Fotos
                    </a>
                `;
            }
        }
    }

    html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">`;
    const campos = [
        {k: 'Data da Viagem/Bate e Volta', l: '📅 Data'},
        {k: 'Quilometragem Total (ida e volta)', l: '🏍️ KM Total (ida e volta)'},
        {k: 'Distacia da Trilha', l: '🥾 Trilha'},
        {k: 'Nível da Trilha', l: '📊 Nível'},
        {k: 'Entrada', l: '🎫 Entrada'},
        {k: 'Valor da Entrada', l: '💲 Valor'},
        {k: 'Época do Ano com Água', l: '💧 Época'}
    ];
    campos.forEach(c => {
        if(dados[c.k]) html += `<div style="background:#f9f9f9; padding:10px; border-radius:6px;"><strong style="display:block; font-size:11px; color:#888;">${c.l}</strong><span style="font-size:14px; color:#333;">${dados[c.k]}</span></div>`;
    });
    html += `</div>`;

    const textos = [{k: 'Descrição Sobre a Viagem', l: 'Sobre a Viagem'}, {k: 'Descrição da Estrada', l: 'Condições da Estrada'}];
    textos.forEach(c => {
        if(dados[c.k]) html += `<div style="margin-bottom:15px;"><strong style="color:#1a1a1a; font-size:13px; display:block; margin-bottom:5px;">${c.l}</strong><p style="font-size:14px; color:#555; background:#fff; border-left:3px solid #ccc; padding-left:10px; margin:0;">${dados[c.k]}</p></div>`;
    });

    if (dados['Link Google Maps']) {
        html += `<a href="${dados['Link Google Maps']}" target="_blank" style="display:block; text-align:center; background:#fff; border:2px solid #1a1a1a; color:#1a1a1a; padding:10px; border-radius:6px; text-decoration:none; font-weight:bold; margin-top:20px;">🗺️ Abrir no Google Maps</a>`;
    }

    divConteudo.innerHTML = html;
};

// =========================================
// 9. FUNÇÕES DE ADMINISTRAÇÃO (RECUPERADAS)
// =========================================

// Esta função recupera a lista para o Dropdown
window.obterDadosParaEdicao = function(tipoAdmin) {
    const lista = [];
    for (let key in layers) {
        const grupo = layers[key];
        const ehViagem = (key === 'Viagem Realizada');
        
        if (tipoAdmin === 'viagens' && ehViagem) {
            grupo.eachLayer(l => {
                if(l.dadosLocais) lista.push({ id: L.Util.stamp(l), nome: l.dadosLocais['Nome do Lugar'] });
            });
        }
        else if (tipoAdmin === 'lugares' && !ehViagem) {
            grupo.eachLayer(l => {
                if(l.dadosLocais) lista.push({ id: L.Util.stamp(l), nome: l.dadosLocais['Nome do Lugar'] });
            });
        }
    }
    return lista.sort((a, b) => a.nome.localeCompare(b.nome));
};

// Esta função preenche o formulário quando seleciona um item
window.obterDadosPorId = function(id) {
    let dados = null;
    for (let key in layers) {
        layers[key].eachLayer(l => {
            if(L.Util.stamp(l) == id) dados = l.dadosLocais;
        });
        if(dados) break;
    }
    return dados;
};