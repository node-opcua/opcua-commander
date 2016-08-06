"use strict";

require("colors");
var _ = require("underscore");
var assert = require("assert");

var blessed = require('blessed');
var contrib = require("blessed-contrib");

var widget_tree = require("./widget_tree");
var opcua = require("node-opcua");


var NodeClass = require("node-opcua/lib/datamodel/nodeclass").NodeClass;
opcua.NodeClass = NodeClass;
var attributeIdtoString = _.invert(opcua.AttributeIds);
var DataTypeIdsToString = _.invert(opcua.DataTypeIds);
var NodeClassToString = _.invert(opcua.NodeClass);





var argv = require('yargs')
    .wrap(132)

    .demand("endpoint")
    .string("endpoint")
    .describe("endpoint", "the end point to connect to ")

    .string("securityMode")
    .describe("securityMode", "the security mode")

    .string("securityPolicy")
    .describe("securityPolicy", "the policy mode")

    .string("userName")
    .describe("userName", "specify the user name of a UserNameIdentityToken ")

    .string("password")
    .describe("password", "specify the password of a UserNameIdentityToken")

    .string("node")
    .describe("node","the nodeId of the value to monitor")

    .string("history")
    .describe("history","make an historical read")

    .alias('e', 'endpoint')
    .alias('s', 'securityMode')
    .alias('P', 'securityPolicy')
    .alias("u", 'userName')
    .alias("p", 'password')
    .alias("n", 'node')
    .alias("t", 'timeout')

    .example("opcua-commander  --endpoint opc.tcp://localhost:49230 -P=Basic256 -s=SIGN")
    .example("opcua-commander  -e opc.tcp://localhost:49230 -P=Basic256 -s=SIGN -u JoeDoe -p P@338@rd ")
    .example("opcua-commander  --endpoint opc.tcp://localhost:49230  -n=\"ns=0;i=2258\"")

    .argv;


var securityMode = opcua.MessageSecurityMode.get(argv.securityMode || "NONE");
if (!securityMode) {
    throw new Error("Invalid Security mode , should be " + opcua.MessageSecurityMode.enums.join(" "));
}

var securityPolicy = opcua.SecurityPolicy.get(argv.securityPolicy || "None");
if (!securityPolicy) {
    throw new Error("Invalid securityPolicy , should be " + opcua.SecurityPolicy.enums.join(" "));
}

var monitored_node = argv.node || "ns=1;s=PumpSpeed";


var endpointUrl = argv.endpoint || "opc.tcp://localhost:26543";

if (!endpointUrl) {
    require('yargs').showHelp();
    return;
}


var options = {
    securityMode: securityMode,
    securityPolicy: securityPolicy,
    //xx serverCertificate: serverCertificate,
    defaultSecureTokenLifetime: 40000
};
var client = new opcua.OPCUAClient(options);

var g_session = null;

var populateTree = function () {
};

var g_subscription = null;
function create_subscription() {

    assert(g_session);
    var parameters = {
        requestedPublishingInterval: 100,
        requestedLifetimeCount: 1000,
        requestedMaxKeepAliveCount: 12,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10
    };
    g_subscription = new opcua.ClientSubscription(g_session, parameters);

}


client.connect(endpointUrl, function () {

    var userIdentity = null; // anonymous
    if (argv.userName && argv.password) {

        userIdentity = {
            userName: argv.userName,
            password: argv.password
        };

    }

    client.createSession(userIdentity,function (err, session) {
        if (!err) {
            g_session = session;
            create_subscription();
            populateTree();
        } else {
            console.log(" Cannot create session ", err.toString());
            process.exit(-1);
        }

        //xx callback(err);
    });
});

function disconnect() {
    g_session.close(function () {
        client.disconnect(function (err) {

        });
    });
}


var monitoredItemsListData = [];

function monitor_item(treeItem) {

    var node = treeItem.node;


    var monitoredItem = g_subscription.monitor({
            nodeId: node.nodeId,
            attributeId: opcua.AttributeIds.Value
            //, dataEncoding: { namespaceIndex: 0, name:null }
        },
        {
            samplingInterval: 1000,
            discardOldest: true,
            queueSize: 100
        });
    // subscription.on("item_added",function(monitoredItem){
    //xx monitoredItem.on("initialized",function(){ });
    //xx monitoredItem.on("terminated",function(value){ });


    node.monitoredItem = monitoredItem;

    var browseName = treeItem.browseName || node.nodeId.toString();


    var monitoredItemData = [node.browseName, node.nodeId.toString(), 'Q'];
    monitoredItemsListData.push(monitoredItemData);
    monitoredItemsList.setRows(monitoredItemsListData);
    if (false) {
        var series1 = {
            title: browseName,
            x: [],
            y: []
        };
        line.setData(series1);
    }


    monitoredItem.on("changed", function (dataValue) {

        console.log(" value ", node.browseName, node.nodeId.toString(), " changed to ", dataValue.value.toString().green)
        if (dataValue.value.value.toFixed) {
            node.valueAsString = w(dataValue.value.value.toFixed(3), 16);
        } else {
            node.valueAsString = w(dataValue.value.value.toString(), 16);
        }

        //xx series1.title =  browseName+ " = " + dataValue.value.toString();
        //xx series1.x.push(series1.x.length+1);
        //xx series1.y.push(dataValue.value.value);
        //xxsqline.setData(series1);
        monitoredItemData[2] = node.valueAsString;
        monitoredItemsList.setRows(monitoredItemsListData);
        monitoredItemsList.render();
    });

}

function unmonitor_item(treeItem) {
    var node = treeItem.node;
    var browseName = treeItem.browseName || node.nodeId.toString();

    // teminate subscription
    node.monitoredItem.terminate();
  
    var index = -1
    monitoredItemsListData.forEach(function(entry, i) {
      if (entry[1] == node.nodeId.toString()) {
        index = i;
      }
    });
    if (index > -1) {  
      monitoredItemsListData.splice(index, 1);
    }
    
    node.monitoredItem = null; 
    
    if (monitoredItemsListData.length > 0) {
      monitoredItemsList.setRows(monitoredItemsListData);
    } else {
      // when using setRows with empty array, the view does not update.
      // setting an empty row.
      var empty = [[" "]];
      monitoredItemsList.setRows(empty);
    }
    
    monitoredItemsList.render();
     
}

/**
 * @param options.class
 * @param options.nodeId
 * @param options.arrow
 * @constructor
 */
function TreeItem(options) {
    var self = this;
    Object.keys(options).forEach(function (k) {
        self[k] = options[k];
    });
}
TreeItem.prototype.__defineGetter__("name", function () {
    return this.arrow
});
TreeItem.prototype.__defineGetter__("name", function () {
    var str = this.arrow + " " + this.browseName;
    if (this.class === opcua.NodeClass.Variable) {
        str += " = " + this.valueAsString;
    }
    return str;
});


function expand_opcua_node(node, callback) {

    if (!g_session) {
        return callback(new Error("No Connection"));
    }
    var children = [];

    var b = [
        {
            nodeId: node.nodeId,
            referenceTypeId: "Organizes",
            browseDirection: opcua.browse_service.BrowseDirection.Forward,
            resultMask: 0x3f

        },
        {
            nodeId: node.nodeId,
            referenceTypeId: "HasProperty",
            browseDirection: opcua.browse_service.BrowseDirection.Forward,
            resultMask: 0x3f

        },
        {
            nodeId: node.nodeId,
            referenceTypeId: "HasComponent",
            browseDirection: opcua.browse_service.BrowseDirection.Forward,
            resultMask: 0x3f

        }
    ];

    g_session.browse(b, function (err, results) {

        if (!err) {

            var result = results[0];
            var i;
            for (i = 0; i < result.references.length; i++) {
                var ref = result.references[i];
                children.push(new TreeItem({
                    arrow: "◊-o-> ",
                    browseName: ref.browseName.toString(),
                    nodeId: ref.nodeId,
                    class: ref.class,
                    children: expand_opcua_node
                }))
            }

            result = results[1];
            for (i = 0; i < result.references.length; i++) {
                var ref = result.references[i];
                children.push(new TreeItem({
                    arrow: "╙p-> ",
                    browseName: ref.browseName.toString(),
                    nodeId: ref.nodeId,
                    class: ref.class,
                    children: expand_opcua_node
                }));
            }
            result = results[2];
            for (i = 0; i < result.references.length; i++) {
                var ref = result.references[i];
                children.push(new TreeItem({
                    arrow: "╙c-> ",
                    browseName: ref.browseName.toString(),
                    nodeId: ref.nodeId,
                    class: ref.class,
                    children: expand_opcua_node
                }));
            }
        }
        callback(err, children);
    });
}


// Create a screen object.
var screen = blessed.screen({
    smartCSR: true,
    autoPadding: false,
    fullUnicode: true
});
screen.title = 'OPCUA CLI-Client';

// create the main area
var area1 = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '90%-10',
});
screen.append(area1);
var area2 = blessed.box({
    top: '90%-9',
    left: 0,
    width: '100%',
    height: 'shrink',

});
screen.append(area2);

var scrollbar = {
    ch: ' ',
    track: {
        bg: 'cyan'
    },
    style: {
        inverse: true
    }
};
var style = {

    focus: {
        border: {
            fg: 'yellow'
        },
        bold: false

    },
    item: {
        hover: {
            bg: 'blue'
        }
    },
    selected: {
        bg: 'blue',
        bold: true
    }
};
var w1 = 'left';
var w2 = '40%';
var w3 = '70%';

var attributeList = null;

function w(s, l, c) {
    c = c || " ";
    var filling = Array(25).join(c[0]);
    return (s + filling).substr(0, l);
}
function makeItems(arr) {
    return arr.map(function (a) {
        return w(a[0], 25, ".") + ": " + w(a[1], attributeList.width - 28);
    });
}
function install_attributeList() {


    attributeList = blessed.list({
        parent: area1,
        label: ' {bold}{cyan-fg}Attribute List{/cyan-fg}{/bold} ',
        top: 0,
        tags: true,
        left: w2 + "+1",
        width: '60%-1',
        height: '50%',
        border: 'line',
        noCellBorders: true,
        scrollbar: scrollbar,
        style: _.clone(style),
        align: "left",
        keys: true
    });
    area1.append(attributeList);

    attributeList.setItems(makeItems([]));
}

function d(dataValue) {
    if (!dataValue.value || dataValue.value.value === null) {
        return "<???> : " + dataValue.statusCode.toString();
    }
    switch (dataValue.value.arrayType) {
        case opcua.VariantArrayType.Scalar:
            return dataValue.value.value.toString();
        case opcua.VariantArrayType.Array:
            return "l= " + dataValue.value.value.length + " [ " + dataValue.value.value[0] + " ... ]"

    }
    return "";
}

function toString1(attribute, dataValue) {

    if (!dataValue.value.hasOwnProperty("value")) {
        return "<null>";
    }
    switch (attribute) {
        case opcua.AttributeIds.DataType:
            return DataTypeIdsToString[dataValue.value.value.value] + " (" + dataValue.value.value.toString() + ")";
        case opcua.AttributeIds.NodeClass:
            return NodeClass.get(dataValue.value.value).key + " (" + dataValue.value.value + ")";
        case opcua.AttributeIds.WriteMask:
        case opcua.AttributeIds.UserWriteMask:
            return " (" + dataValue.value.value + ")";
        case opcua.AttributeIds.UserAccessLevel:
        case opcua.AttributeIds.AccessLevel:
            return opcua.AccessLevelFlag.get(dataValue.value.value).key + " (" + dataValue.value.value + ")";
        default:
            return d(dataValue);
    }
}


function fill_attributesRegion(node) {

    var attr = [];
    g_session.readAllAttributes(node.nodeId, function (err, nodesToRead, dataValues) {

        if (!err) {

            var i;
            for (i = 0; i < nodesToRead.length; i++) {

                var nodeToRead = nodesToRead[i];
                var dataValue = dataValues[i];
                if (dataValue.statusCode !== opcua.StatusCodes.Good) {
                    continue;
                }
                var s = toString1(nodeToRead.attributeId, dataValue);

                var a = s.split("\n");
                if (a.length === 1) {
                    attr.push([attributeIdtoString[nodeToRead.attributeId], s]);
                } else {
                    attr.push([attributeIdtoString[nodeToRead.attributeId], a[0]]);
                    for (i = 1; i < a.length; i++) {
                        attr.push(["   |    ", a[i]]);
                    }
                }
            }
            attributeList.setItems(makeItems(attr));
            attributeList.screen.render();
        } else {
            console.log("#readAllAttributes returned ",err.message);
        }
    })
}

var refreshTimer = 0;
var tree;
function install_address_space_explorer() {

    tree = widget_tree.tree({
        parent: area1,
        tags: true,
        fg: 'green',
        //Xx keys: true,
        label: ' {bold}{cyan-fg}Address Space{/cyan-fg}{/bold} ',
        top: 'top',
        left: 'left',
        width: '40%',
        height: '100%',
//xx    keys: true,
        vi: true,
        mouse: true,
        border: 'line',
        style: _.clone(style)

    });

    //allow control the table with the keyboard
    tree.on('select', function (treeItem, index) {
        if (treeItem) {
            fill_attributesRegion(treeItem.node);
        }
    });
    tree.on('keypress', function (ch, key) {
        if (key.name === 'up' || key.name === 'down') {
            if (refreshTimer) {
                return;
            }
            var self = this;
            refreshTimer = setTimeout(function () {
                var treeItem = self.items[self.selected];
                if (treeItem && treeItem.node) {
                    fill_attributesRegion(treeItem.node);
                }
                refreshTimer = 0;
            }, 100);
        }

    });

    area1.append(tree);


    populateTree = function () {
        tree.setData({
            name: "RootFolder",
            nodeId: opcua.resolveNodeId("RootFolder"),
            children: expand_opcua_node
        });
    };

    tree.focus();
}

var monitoredItemsList = null;
function install_monitoredItemsWindow() {

    monitoredItemsList = blessed.listtable(
        {
            parent: area1,
            tags: true,
            top: "50%",
            left: w2 + "+1",
            width: '60%-1',
            height: '50%',
            keys: true,
            label: ' Monitored Items ',
            border: 'line',
            scrollbar: scrollbar,
            noCellBorders: true,
            style: _.clone(style),
            align: "left"
        });

    area1.append(monitoredItemsList);

    //xx monitoredItemsList.setRows([["1","a"]])

}
var line = null;
function install_graphWindow() {
    line = contrib.line(
        {
            top: "40%+1",
            left: w2 + "-1",
            width: '70%-1',
            height: '40%-8',
            keys: true,
            style: {
                line: "yellow"
                , text: "green"
                , baseline: "black"
            }
            , xLabelPadding: 3
            , xPadding: 5
            , showLegend: true
            , wholeNumbersOnly: false //true=do not show fraction in y axis
            , label: 'Title'
        });


    screen.append(line);

    var series1 = {
        title: 'apples',
        x: ['t1', 't2', 't3', 't4'],
        y: [5, 1, 7, 5]
    };
    line.setData(series1);


}

function install_logWindow() {

    var logWindow = blessed.list({

        parent: area2,
        tags: true,
        label: ' {bold}{cyan-fg}Info{/cyan-fg}{/bold} ',
        top: 'top',
        left: 'left',
        width: '100%',
        height: '100%-4',
        keys: true,
        border: 'line',
        scrollable: true,
        scrollbar: {
            ch: ' ',
            track: {
                bg: 'cyan'
            },
            style: {
                inverse: true
            }
        },
        style: _.clone(style)
    });

    var lines;
    var console_log = console.log;
    var format = require("util").format;
    console.log = function () {

        var str = format.apply(null, arguments);
        lines = str.split("\n");
        lines.forEach(function (str) {
            logWindow.addItem(str);
        });
        logWindow.select(logWindow.items.length - 1);

        //xx   screen.render();
    };

    area2.append(logWindow);

    var menuBar = blessed.listbar({
        parent: area2,
        top: '100%-2',
        left: 'left',
        width: '100%',
        height: 2,
        keys: true,
        style: {
            prefix: {
                fg: 'white'
            }
        },
        //xx label: ' {bold}{cyan-fg}Info{/cyan-fg}{/bold}',
        //xx border: 'line',
        bg: 'cyan'
    });


    area2.append(menuBar);
    menuBar.setItems({

        'Monitor': {
            //xx prefix: 'M',
            keys: ['m'],
            callback: function () {
                var treeItem = tree.items[tree.selected];
                if (treeItem.node.monitoredItem) {
                    console.log(" Already monitoring ", treeItem.node.nodeId.toString());
                    return;
                }
                monitor_item(treeItem);
            }
        },
        'Exit': {
            keys: ['C-c','escape'],
            callback: function () {
                return process.exit(0);
            }
        },
        'Next': {
            keys: ['tab'],
            callback: function () {
                console.log("next tab");
            }
        },

        // screen.key(['l'], function (ch, key) {
        'Tree': {
            keys: ['t'],
            callback: function () {
                tree.focus();
            }
        },
        'Attributes': {
            keys: ['l'],
            callback: function () {
                console.log("setting focus to list");
                attributeList.focus();
            }

        },
        'Info': {
            keys: ['i'],
            callback: function () {
                console.log("setting focus to info");
                logWindow.focus();
            }
        },
        'Clear': {
            keys: ['c'],
            callback: function () {
                logWindow.clearItems();
                logWindow.screen.render();
            }
        },
        'Unmonitor': {
            keys: ['u'],
            callback: function () {
                var treeItem = tree.items[tree.selected];
                if (!treeItem.node.monitoredItem) {
                    console.log(treeItem.node.nodeId.toString(), " was not being monitored");
                    return;
                }
                unmonitor_item(treeItem);
            }
        }

    });
}


install_address_space_explorer();
//xx install_graphWindow();
install_attributeList();
install_monitoredItemsWindow();

install_logWindow();


// Render the screen.
screen.render();
console.log(" Welcome to Node-OPCUA CLI".red, "  Client".green);
console.log("   endpoint url   = ".cyan, endpointUrl.toString());
console.log("   securityMode   = ".cyan, securityMode.toString());
console.log("   securityPolicy = ".cyan, securityPolicy.toString());
