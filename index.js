let config;
fetch('./config.json')
  .then(response => response.text())
  .then(responseText => config = JSON.parse(responseText));

if (!chrome.cookies) {
  chrome.cookies = chrome.experimental.cookies;
}

const loadEMRXhr = (region, action, parameters, successCallback, errorCallback) => {
  const payload = JSON.parse(JSON.stringify(config.commonPayload));
  payload.actions[ 0 ].action += action;
  payload.actions[ 0 ].parameters.push(parameters);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `https://${region}${config.commonPath}${config.linkExtensionPathXhr}`, true);
  xhr.setRequestHeader('Content-type', 'application/json');
  xhr.withCredentials = true;
  xhr.onload = () =>
    xhr.status !== 200 ?
      errorCallback(xhr) :
      successCallback(JSON.parse(xhr.responseText).actionResponses[ 0 ].data);
  xhr.send(JSON.stringify(payload));
};

const createMainElements = (region) => {
  const accordion = document.createElement('button');
  accordion.setAttribute('class', 'accordion');
  accordion.innerText = region.name;
  const container = document.createElement('div');
  container.setAttribute('class', 'container');
  return { accordion, container };
};

const addRowToRegionContainer = (row, container, text) => {
  row.classList.toggle('container__line');
  row.innerText = text;
  container.appendChild(row);
  return row;
};

const createRowInRegionContainer = (container, text, active) => {
  if (active) {
    const row = document.createElement('li');
    row.classList.toggle('active');
    return addRowToRegionContainer(row, container, text);
  } else {
    return addRowToRegionContainer(document.createElement('p'), container, text);
  }
};

const addClickForOpeningContainer = (accordion) => {
  accordion.addEventListener('click', (event) => {
    event.target.classList.toggle('active');
    const container = event.target.nextElementSibling;
    if (container.style.maxHeight) {
      container.style.maxHeight = null;
    } else {
      container.style.maxHeight = `${container.scrollHeight}px`;
    }
  });
};

const processClusters = (region, clusters) => {
  console.log(clusters);
  const { accordion, container } = createMainElements(region);

  if (clusters.length) {
    container.style.padding = "0";
    const list = document.createElement('ul');
    container.appendChild(list);

    clusters.forEach(cluster => {
      console.log(cluster);
      const row = createRowInRegionContainer(list, `${cluster.name} - ${cluster.id} - ${cluster.status.state}`, true);

      let masterPrivateIP;
      const listInstanceGroupsPayload = config.actions.listInstanceGroups.parameters;
      listInstanceGroupsPayload.clusterId = cluster.id;
      loadEMRXhr(
        region.extension,
        config.actions.listInstanceGroups.name,
        listInstanceGroupsPayload,
        (response) => {
          console.log(response);
          const masterGroupId = response.instanceGroups.find(group => group.instanceGroupType === config.masterNodeName).id;
          const listInstancesPayload = config.actions.listInstances.parameters;
          listInstancesPayload.clusterId = cluster.id;
          listInstancesPayload.instanceGroupId = masterGroupId;
          loadEMRXhr(
            region.extension,
            config.actions.listInstances.name,
            listInstancesPayload,
            (response) => masterPrivateIP = response.instances[ 0 ].privateIpAddress
          )
        }
      );

      row.onclick = () =>
        chrome.tabs.create({
          url: `http://${masterPrivateIP}:${config.masterPrivatePort}`,
          selected: true
        });
    });
  }

  if (clusters.length === 0) {
    createRowInRegionContainer(container, config.noClustersText);
  }

  document.body.appendChild(accordion);
  document.body.appendChild(container);

  if (config.regions.length === document.body.querySelectorAll('button').length) {
    document.querySelector('.clusters__info').style.display = 'none';
  }

  addClickForOpeningContainer(accordion);
};

const onload = () => {
  chrome.cookies.getAll({}, cookies => {
    config.regions.forEach(region => {
      const awsCookies = cookies.filter(cookie =>
        (cookie.domain.includes(region.extension + config.commonPath) && cookie.name === config.cookieCredentials) ||
        (cookie.domain.includes(config.commonDomain) && cookie.name === config.cookieInfo)
      );
      document.cookie = awsCookies.reduce((accumulator, cookie) => cookie.name + '=' + cookie.value + ';', '');
      loadEMRXhr(
        region.extension,
        config.actions.listClustersPrivate.name,
        config.actions.listClustersPrivate.parameters,
        (response) => processClusters(region, response.clusters),
        (xhr) => {
          const infoBlock = document.querySelector('.clusters__info');
          if (xhr.status === 401 && xhr.statusText === 'Unauthorized') {
            const infoText = infoBlock.querySelector('p');
            infoText.innerHTML = config.unauthorizedText;
            const awsLink = document.createElement('a');
            awsLink.innerText = region.name;
            awsLink.title = region.name;
            awsLink.href = "";
            awsLink.onclick = (event) => {
              event.preventDefault();
              chrome.tabs.create({
                url: `https://${config.commonPath}${config.linkExtensionPathHome}?region=${region.id}`,
                selected: true
              });
            };
            infoBlock.appendChild(awsLink);
          }
        }
      )
    });
  });
};

document.addEventListener('DOMContentLoaded', () => onload());
