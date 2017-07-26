
Ext.define('Rally.technicalservices.ArtifactTree',{
    logger: new Rally.technicalservices.Logger(),
    mixins: {
        observable: 'Ext.util.Observable'
    },

    rootArtifact: undefined,
    modelHash: null,
    portfolioItemTypes: undefined,
    childTypesBlacklist: undefined,
    parentChildTypeMap: null,
    blacklistFields: null,

    canceledPrefix: "[CANCELLED] ",
    canceledScheduleState: "Defined",
    completedStates: [],
    canceledPortfolioStates: {},
    canceledReleaseHash: {},

    stoppedByError: false,

    constructor: function(config){

        this.blacklistFields = ['Workspace','Attachments','Tags','Discussion','Milestones'];
        this.childTypesBlacklist = config.childTypesBlacklist || ['testcase','defectsuite','defect'];
        this.parentChildTypeMap = this._setupParentChildMap(config.portfolioItemTypes);
        this.modelHash = {};

        this.canceledPortfolioStates= config.portfolioItemCanceledStates;
        this.canceledReleaseHash= config.canceledReleaseHash;
        this.completedStates = config.completedStates;
        this.canceledScheduleState = config.canceledScheduleState;
        this.canceledPrefix = config.canceledPrefix;

        this.mixins.observable.constructor.call(this, config);

    },
    load: function(rootArtifact, rootParent){
        this.logger.log('load:', rootArtifact, rootParent);

        this.totalRecords = 1;
        this.tree = {};
        this.stoppedByError = false;
        this.rootArtifact = rootArtifact;

        this._loadModel(rootArtifact);
    },
    cancelItems: function(){
      this.logger.log('..cancelItems..');
      var me = this;
      this.totalArtifacts = _.keys(this.tree).length || 0;
      this.completedArtifacts = 0;

      this.fireEvent('statusupdate', 0, this.totalArtifacts);

      me._updateArtifacts().then({
          success: function(batch){
              this.logger.log('cancelItems. _updateArtifacts success', batch);
              this.fireEvent('completed',batch);
          },
          failure: function(batch){
              this.logger.log('cancelItems. _updateArtifacts failure', batch);
              this.fireEvent('error', "Error updating items");
          },
          scope: this
      });
    },
    _updateArtifacts: function(){
        var cancelPrefix = this.canceledPrefix,
            canceledScheduleState = this.canceledScheduleState,
            completedStates = this.completedStates,
            canceledReleases = this.canceledReleaseHash,
            canceledPortfolioStates = this.canceledPortfolioStates,
            updatedRecords = _.pluck(this.tree, 'record');

            this.logger.log('_updateArtifacts', this.tree, completedStates);

            var store = Ext.create('Rally.data.wsapi.batch.Store',{
                data: updatedRecords
            });

        Ext.Array.each(updatedRecords, function(rec){
            var type = rec.get('_type').toLowerCase();
            var changed_fields = [];

            if (type === 'hierarchicalrequirement' && !Ext.Array.contains(completedStates, rec.get('ScheduleState'))){
              //TODO Check schedule state?
                 var newName = cancelPrefix + rec.get('Name');
                 rec.set('Name', newName);
                 changed_fields.push('Name');

                 if (rec.get('DirectChildrenCount') === 0){
                    canceledRelease = canceledReleases[rec.get('Project')._ref];
                    rec.set('ScheduleState', canceledScheduleState);
                    rec.set('Release', canceledRelease);
                    rec.set('PlanEstimate', 0);
                    Ext.Array.push(changed_fields,['ScheduleState','Release','PlanEstimate']);
                 }
            }

            if (type.toLowerCase() === 'task'){
                rec.set('ToDo',0);
                changed_fields.push('ToDo');
            }

            if (/portfolioitem/.test(type)){
              var state = rec.get('State') && rec.get('State')._ref;
              if (!Ext.Array.contains(completedStates, state)){
               rec.set('State', canceledPortfolioStates[type]);
               changed_fields.push('State');
            }}

            rec.set('__changedFields',changed_fields);
        }, this);

        return store.sync();
    },
    _loadModel: function(artifact){
        this._fetchModel(artifact.get('_type')).then({
            success: function(model) {
                this.logger.log('_loadModel success');
                this._loadArtifact(model, artifact);
            },
            failure: function(msg){
                this.tree[artifact.get('ObjectID')].error = msg;
                this._checkForDoneness(msg);
            },
            scope: this
        });

    },
    _loadArtifact: function(model, artifact){
        this.logger.log('_loadArtifact', artifact);
        if (this.stoppedByError){
            return;
        }

        var oid = artifact.get('ObjectID');
        model.load(oid, {
            fetch: true,
            scope: this,
            callback: function(loadedArtifact, operation) {
                if(operation.wasSuccessful()) {
                    this.logger.log('_loadArtifact success', oid, loadedArtifact);
                    this.tree[oid] = this.getTreeNode(loadedArtifact);
                    this._loadArtifactChildren(loadedArtifact);
                } else {
                    this.logger.log('_loadArtifact failure', oid, operation);
                    var msg = Ext.String.format("Failed to load {0}/{1} with error: {2} ",artifact.get('_type'),artifact.get('ObjectID'),operation.error.errors.join(','));
                    this.tree[oid].error = msg;
                    this._checkForDoneness(msg);
                }
            }
        });
    },
    getTreeNode: function(artifact){
        return {record: artifact, error: null, childCount: {}};
    },

    _loadArtifactChildren: function(artifact){
        if (this.stoppedByError){
            return;
        }

        var childrenToLoad = this.parentChildTypeMap[artifact.get('_type').toLowerCase()],
            collectionsLoading = 0;

        childrenToLoad = _.filter(childrenToLoad, function(c){
            if (!Ext.Array.contains(this.childTypesBlacklist, c.typePath)){
                return true;
            }
        }, this);

        this.logger.log('_loadArtifactChildren',childrenToLoad, this.parentChildTypeMap, artifact.get('_type').toLowerCase());
        this.collectionsLoading = 0;
        _.each(childrenToLoad, function(c){
            this.logger.log('_loadArtifactChildren child',c, artifact.get(c.collectionName).Count);
            if (artifact.get(c.collectionName).Count > 0){
                this.totalRecords = this.totalRecords + artifact.get(c.collectionName).Count;
                this._loadCollection(artifact, c.collectionName, true);
            }
        }, this);

        if (this.collectionsLoading === 0){
            this._checkForDoneness();
        }
    },
    _checkForDoneness: function(errorMessage){
        this.logger.log('_checkForDoneness', this.tree, this.totalRecords, _.keys(this.tree).length, errorMessage);
        if (errorMessage){
            this.stoppedByError = true;
            this.fireEvent('error', errorMessage);
            return;
        }
        if ((this.tree && _.keys(this.tree).length === this.totalRecords) || (this.collectionsLoading === 0)){
            this.logger.log('TREE LOADED!')
            this.fireEvent('treeloaded', this);
        }
    },
    _loadCollection: function(artifact, collectionName, loadRecord, preserveRefs){
        var deferred = Ext.create('Deft.Deferred'),
            parentOid = artifact.get('ObjectID');
        this.collectionsLoading++;
        this.tree[parentOid][collectionName] = [];

        var filters = [];
        if (!Ext.Array.contains(['Tags','Attachments'],collectionName)){
            filters = [{
                property: 'Project.State',
                value: 'Open'
            }];
        }

        artifact.getCollection(collectionName).load({
            fetch: ['ObjectID'],
            filters: filters,
            callback: function(records, operation, success) {
                this.logger.log('_loadCollection callback', collectionName, records, success);

                if (success){
                    _.each(records, function(r){
                        var val = r.get('ObjectID');
                        if (preserveRefs){
                            val = r.get('_ref');
                        }
                        this.tree[parentOid][collectionName].push(val);
                        if (loadRecord){
                            this._loadModel(r);
                        }
                    }, this);
                    deferred.resolve();
                } else {
                    var msg = Ext.String.format("Failed to load collecton for {0}/{1} with error: {2} ",artifact.get('_type'),artifact.get('ObjectID'),operation.error.errors.join(','));
                    this.tree[parentOid].error = msg;
                    this._checkForDoneness(msg);
                    deferred.reject(msg);
                }
            },
            scope: this
        }).always(function(){
          this.collectionsLoading--;
        },this);

        return deferred;
    },
    _fetchModel: function(type){
        var deferred = Ext.create('Deft.Deferred');
        if (this.modelHash[type]){
            deferred.resolve(this.modelHash[type]);
        } else {
            Rally.data.ModelFactory.getModel({
                type: type,
                success: function(model){
                    this.modelHash[type] = model;
                    deferred.resolve(model);
                },
                failure: function(){
                    var msg = 'Failed to load model: ' + type;
                    this._checkForDoneness(msg);
                    deferred.reject(msg);
                },
                scope: this
            });
        }
        return deferred;
    },
    _setupParentChildMap: function(portfolioItemsByOrdinal){
        var parentChildTypeMap = {
            hierarchicalrequirement: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'Requirement'},
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'},
                {typePath: 'hierarchicalrequirement', collectionName: 'Children', parentField: 'Parent'}
            ],
            defect: [
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            defectsuite: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'DefectSuites'},
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            testset: [
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'TestSets'}
            ]
        };

        if (portfolioItemsByOrdinal && portfolioItemsByOrdinal.length > 0){
            parentChildTypeMap[portfolioItemsByOrdinal[0].toLowerCase()] = [{typePath: 'hierarchicalrequirement', collectionName: 'UserStories', parentField: 'PortfolioItem'}];

            for (var i = 1; i<portfolioItemsByOrdinal.length ; i++){
                parentChildTypeMap[portfolioItemsByOrdinal[i].toLowerCase()] = [{typePath: portfolioItemsByOrdinal[i-1], collectionName: 'Children', parentField: 'Parent'}];
            }
        }
        return parentChildTypeMap;
    }
});
