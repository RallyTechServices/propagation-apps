Ext.define("catsFeatureCancellation", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'display_box'}
    ],
    integrationHeaders : {
        name : "catsFeatureCancellation"
    },

    config: {
        defaultSettings: {
            rootModelTypePath: 'PortfolioItem/Feature',
            canceledScheduleState: 'Defined',
            canceledReleaseName: 'Cancelled',
            canceledPortfolioStateName: 'Cancelled',
            canceledPrefix: '[CANCELLED] '
        }
    },

    launch: function() {

        Deft.Promise.all([
          Rally.technicalservices.Toolbox.fetchPortfolioItemStateRefs(this.getCanceledPortfolioStateName()),
          Rally.technicalservices.Toolbox.fetchPortfolioItemTypes(),
          Rally.technicalservices.Toolbox.fetchReleases(this.getCanceledReleaseName()),
          Rally.technicalservices.Toolbox.fetchCompletedScheduleStates()
        ])
        .then({
            success: this.initializeApp,
            failure: this.showErrorNotification,
            scope: this
        });

        this.subscribe(this, 'statusUpdate', this.statusUpdate, this);
        this.subscribe(this, 'maskUpdate', this.maskUpdate, this);
        this.subscribe(this, 'bulkActionComplete', this.statusUpdate, this);
        this.subscribe(this, 'bulkActionError', this.showErrorNotification, this);
    },
    getCanceledReleaseName: function(){
      return this.getSetting('canceledReleaseName');
    },
    getCanceledPortfolioStateName: function(){
      return this.getSetting('canceledPortfolioStateName');
    },
    getCanceledScheduleState: function(){
      return this.getSetting('canceledScheduleState');
    },
    getCanceledPrefix: function(){
      return this.getSetting('canceledPrefix');
    },
    getCompletedStates: function(){
      this.logger.log('getCompletedStates', this.getSetting('completedStates'));
      if (!Ext.isArray(this.getSetting('completedStates'))){
         return this.getSetting('completedStates').split(',');
      }
      return this.getSetting('completedStates');
    },
    maskUpdate: function(arg){

        if (!arg || arg === ''){
            arg = false;
        }
        this.setLoading(arg);
        this.refresh();
    },
    initializeApp: function(results){
        this.portfolioItemCanceledStates = results[0];
        this.portfolioItemTypePaths = results[1];
        this.canceledReleaseHash = results[2];
        this.completedStates = results[3].concat(this.getCompletedStates());
        this.down('#display_box').removeAll();

        this.logger.log('initializeApp', results[0],results[1],results[2], this.completedStates);

        if (!Ext.Array.contains(this.portfolioItemTypePaths, this.getRootModelTypePath())){
            this.down('#display_box').add({
              xtype: 'container',
              html: "Please configure an Artifact Type in the App Settings."
            });
            return;
        }

        this.buildTreeStore();
    },
    buildTreeStore: function(){
        this.down('#display_box').removeAll();

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: [this.getRootModelTypePath()],
            enableHierarchy: true
        }).then({
            success: this.buildGridboard,
            scope: this
        });
    },
    buildGridboard: function(store){
        if (this.down('rallygridboard')){
            this.down('rallygridboard').destroy();
        }

        var typesToCancel = this.getTypesToCancel();

        this.add({
            xtype: 'rallygridboard',
            context: this.getContext(),
            modelNames: this.getRootModelTypePath(),
            toggleState: 'grid',
            gridConfig: {
                store: store,
                storeConfig: {
                    pageSize: 200
                },
                columnCfgs: [
                    'Name',
                    'Project'
                ],
                bulkEditConfig: {
                    items: [{
                        xtype: 'rallyrecordmenuitembulkcancel' ,
                        portfolioItemTypes: this.getPortfolioItemTypePaths(),
                        portfolioItemCanceledStates: this.portfolioItemCanceledStates,
                        canceledReleaseHash: this.canceledReleaseHash,
                        canceledScheduleState: this.getCanceledScheduleState(),
                        canceledPrefix: this.getCanceledPrefix(),
                        completedStates: this.completedStates,
                        types: typesToCancel
                    }]
                }
            },
            plugins: this.getPlugins(),
            height: this.getHeight()
        });

    },
    getPlugins: function(){
        return [{
            ptype: 'rallygridboardfieldpicker',
            headerPosition: 'left',
            modelNames: this.getTypesToCancel(),
            stateful: true,
            stateId: this.getContext().getScopedStateId('deep-copy-columns')
        },{
            ptype: 'rallygridboardinlinefiltercontrol',
            inlineFilterButtonConfig: {
                stateful: true,
                stateId: this.getContext().getScopedStateId('deep-copy-filter'),
                modelNames: [this.getRootModelTypePath()],
                inlineFilterPanelConfig:
                {
                    collapsed: false,
                    quickFilterPanelConfig: {
                        defaultFields: ['Owner']
                    }
                }
            }
        }];
    },
    statusUpdate: function(msg){
        Rally.ui.notify.Notifier.hide();
        Rally.ui.notify.Notifier.show({message: msg, showForever: true});
    },
    getTypesToCancel: function(){

        var typesToCancel = [],
            rootModelTypePath = this.getRootModelTypePath();

        if(/PortfolioItem\//.test(rootModelTypePath)){
            Ext.Array.each(this.getPortfolioItemTypePaths(), function(p){
                typesToCancel.unshift(p);
                return p !== rootModelTypePath;
            });
        }
        return typesToCancel;
    },
    getPortfolioItemTypePaths: function(){
        return this.portfolioItemTypePaths;
    },
    getRootModelTypePath: function(){
        return this.getSetting('rootModelTypePath');
    },
    showErrorNotification: function(msg){
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    getSettingsFields: function(){

        var filters = [{
            property: 'TypePath',
            operator: 'contains',
            value: 'PortfolioItem/'
        }];

        return [{
            xtype: 'rallycombobox',
            name: 'rootModelTypePath',
            storeConfig: {
                model: 'TypeDefinition',
                fetch: ['TypePath','DisplayName'],
                filters: filters,
                remoteFilter: true
            },
            displayField: 'DisplayName',
            valueField: 'TypePath',
            fieldLabel: 'Artifact Type',
            labelAlign: 'right',
            labelWidth: 200,
            width: 400
        },{
           xtype: 'rallyreleasecombobox',
           name: 'canceledReleaseName',
           fieldLabel: 'Canceled Release Name',
           valueField: 'Name',
           displayField: 'Name',
           showArrows: false,
           labelAlign: 'right',
           labelWidth: 200,
           width: 400

        },{
           xtype: 'rallyfieldvaluecombobox',
           name: 'canceledScheduleState',
           fieldLabel: 'Canceled Schedule State',
           labelAlign:  'right',
           model: 'HierarchicalRequirement',
           field: 'ScheduleState',
           labelWidth: 200,
           width: 400
        },{
          xtype: 'rallycombobox',
          name: 'completedStates',
          fieldLabel: 'Completed Portfolio States',
          labelAlign:  'right',
          storeConfig: {
              model: 'State',
              fetch: ['Name','TypeDef','TypePath'],
              remoteFilter: true,
              sorters: [{
                property: 'Name',
                direction: 'ASC'
              }]
          },
          displayField: 'Name',
          valueField: '_ref',
          multiSelect: true,
          labelWidth: 200,
          width: 400,
          listConfig: {
              cls: 'rally-checkbox-boundlist',
              itemTpl: Ext.create('Ext.XTemplate',
                '<div class="rally-checkbox-image"></div>',
                '<div class="rally-checkbox-text">{Name:htmlEncode} (<span style="font-family:NotoSansBold, Helvetica, Arial">{[values.TypeDef.Name]}</span>)</div>')
          }
        }];
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }

});
